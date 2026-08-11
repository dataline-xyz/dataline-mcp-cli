import type { DataApiClient } from "../../data-api/types.js";
import { ToolInputError } from "../../mcp/tool-result.js";
import { dedupeWarnings } from "../shared/issues.js";
import { firstString, records, type JsonRecord } from "../shared/records.js";
import {
  aavePosition,
  bluePosition,
  fixedRateMarket,
  lendingSourceTime,
  lendingVault,
  lendingWarnings,
  midnightPosition,
  normalizePositions,
  variableMarket,
} from "./normalize.js";
import type {
  FixedMarketSearchInput,
  FixedMarketSearchOutput,
  LendingPositionsInput,
  LendingPositionsOutput,
  LendingProductDetailInput,
  LendingProductDetailOutput,
  LendingVaultSearchInput,
  LendingVaultSearchOutput,
  VariableMarketSearchInput,
  VariableMarketSearchOutput,
} from "./schema.js";

const MARKET_ID_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export class LendingService {
  readonly #client: DataApiClient;

  constructor(client: DataApiClient) {
    this.#client = client;
  }

  async findVariableMarkets(input: VariableMarketSearchInput): Promise<VariableMarketSearchOutput> {
    const response = await this.#client.get<JsonRecord>("/defi/lending/variable-rate/markets", {
      network: "base",
      protocol: input.protocol,
      loan_asset: input.loan_asset_address,
      collateral_asset: input.collateral_asset_address,
      sort: input.sort,
      order: input.order,
      limit: input.limit,
      offset: input.offset,
    });
    const rawItems = records(response.data.items);
    const markets = rawItems.flatMap((item) => {
      const market = variableMarket(item, input.detail_level, input.protocol);
      return market ? [market] : [];
    });
    const hasMore = response.data.has_more === true;
    return {
      detail_level: input.detail_level,
      count: markets.length,
      limit: input.limit,
      offset: input.offset,
      next_offset: hasMore ? input.offset + input.limit : null,
      has_more: hasMore,
      markets,
      as_of: lendingSourceTime(response.data),
      warnings: lendingWarnings(response, rawItems),
      errors: [],
    };
  }

  async findVaults(input: LendingVaultSearchInput): Promise<LendingVaultSearchOutput> {
    if (input.sort === "liquidityUsd" && input.version !== "V2") {
      throw new ToolInputError(
        "unsupported_sort",
        "liquidityUsd sorting is available only for Vault V2.",
        "choose_v2_or_another_sort",
      );
    }

    const response = await this.#client.get<JsonRecord>("/defi/lending/vaults", {
      network: "base",
      version: input.version,
      asset: input.asset_address,
      sort: input.sort,
      order: input.order,
      limit: input.limit,
      offset: input.offset,
    });
    const rawItems = records(response.data.items);
    const vaults = rawItems.flatMap((item) => {
      const value = lendingVault(item, input.detail_level);
      return value ? [value] : [];
    });
    const hasMore = response.data.has_more === true;
    return {
      detail_level: input.detail_level,
      version: input.version,
      count: vaults.length,
      limit: input.limit,
      offset: input.offset,
      next_offset: hasMore ? input.offset + input.limit : null,
      has_more: hasMore,
      vaults,
      as_of: lendingSourceTime(response.data),
      warnings: lendingWarnings(response, rawItems),
      errors: [],
    };
  }

  async findFixedMarkets(input: FixedMarketSearchInput): Promise<FixedMarketSearchOutput> {
    validateTimeRange(input.maturity_from, input.maturity_to, "maturity");
    const response = await this.#client.get<JsonRecord>("/defi/lending/fixed-rate/markets", {
      network: "base",
      protocol: "morpho_midnight",
      loan_asset: input.loan_asset_address,
      collateral_asset: input.collateral_asset_address,
      maturity_gte: input.maturity_from,
      maturity_lte: input.maturity_to,
      active_only: true,
      listed: true,
      sort: input.sort,
      order: input.order,
      limit: input.limit,
      cursor: input.cursor,
    });
    const rawItems = records(response.data.items);
    const markets = rawItems.flatMap((item) => {
      const market = fixedRateMarket(item, input.detail_level);
      return market ? [market] : [];
    });
    return {
      detail_level: input.detail_level,
      count: markets.length,
      limit: input.limit,
      cursor: input.cursor ?? null,
      next_cursor: firstString(response.data.next_cursor) ?? null,
      has_more: response.data.has_more === true,
      markets,
      as_of: lendingSourceTime(response.data),
      warnings: lendingWarnings(response, rawItems),
      errors: [],
    };
  }

  async getProductDetail(input: LendingProductDetailInput): Promise<LendingProductDetailOutput> {
    const request = productDetailRequest(input);
    const response = await this.#client.get<JsonRecord>(request.path, request.query);
    const output: LendingProductDetailOutput = {
      product_type: input.product_type,
      identifier: input.identifier,
      detail_level: input.detail_level,
      as_of: lendingSourceTime(response.data),
      warnings: lendingWarnings(response, [response.data]),
      errors: [],
    };

    if (input.product_type === "variable_rate_market") {
      const market = variableMarket(
        response.data,
        input.detail_level,
        input.variable_rate_protocol,
      );
      if (market) output.variable_rate_market = market;
    } else if (input.product_type === "vault") {
      const vault = lendingVault(response.data, input.detail_level);
      if (vault) output.vault = vault;
    } else {
      const market = fixedRateMarket(response.data, input.detail_level);
      if (market) output.fixed_rate_market = market;
    }
    return output;
  }

  async getPositions(input: LendingPositionsInput): Promise<LendingPositionsOutput> {
    const response = await this.#client.get<JsonRecord>("/defi/lending/account/positions", {
      wallet_address: input.wallet_address,
      network: "base",
      protocol: input.protocol,
      position_type: input.position_type,
    });
    const normalized = normalizePositions(response.data);
    const selectedBlueItems = limitPositions(normalized.blueItems, input.positions_per_product);
    const selectedMidnightItems = limitPositions(
      normalized.midnightItems,
      input.positions_per_product,
    );
    const selectedAaveItems = limitPositions(normalized.aaveItems, input.positions_per_product);
    const availableCounts = {
      blue: normalized.blueItems.length,
      midnight: normalized.midnightItems.length,
      aave_v3: normalized.aaveItems.length,
    };
    const returnedCounts = {
      blue: selectedBlueItems.length,
      midnight: selectedMidnightItems.length,
      aave_v3: selectedAaveItems.length,
    };
    return {
      wallet_address: input.wallet_address,
      network: "base",
      protocol: input.protocol,
      position_type: input.position_type,
      positions_per_product: input.positions_per_product,
      detail_level: input.detail_level,
      partial: normalized.partial,
      protocol_summaries: normalized.protocolSummaries,
      available_counts: availableCounts,
      returned_counts: returnedCounts,
      truncated:
        returnedCounts.blue < availableCounts.blue ||
        returnedCounts.midnight < availableCounts.midnight ||
        returnedCounts.aave_v3 < availableCounts.aave_v3,
      blue_positions: selectedBlueItems.map((item) => bluePosition(item, input.detail_level)),
      midnight_positions: selectedMidnightItems.map((item) =>
        midnightPosition(item, input.detail_level),
      ),
      aave_positions: selectedAaveItems.map((item) => aavePosition(item, input.detail_level)),
      as_of: normalized.sourceTime,
      warnings: dedupeWarnings([...lendingWarnings(response, []), ...normalized.warnings]),
      errors: normalized.errors,
    };
  }
}

function productDetailRequest(input: LendingProductDetailInput): {
  path: string;
  query: Record<string, string>;
} {
  if (input.product_type === "vault") {
    if (!ADDRESS_PATTERN.test(input.identifier)) {
      throw new ToolInputError(
        "invalid_vault_address",
        "Vault detail requires a 20-byte EVM vault address.",
        "use_vault_address_from_find_lending_vaults",
      );
    }
    return {
      path: "/defi/lending/vaults/detail",
      query: { vault_address: input.identifier, version: input.vault_version },
    };
  }

  if (!MARKET_ID_PATTERN.test(input.identifier)) {
    throw new ToolInputError(
      "invalid_market_id",
      "Lending market detail requires a 32-byte market ID.",
      "use_market_id_from_a_lending_discovery_tool",
    );
  }
  return input.product_type === "variable_rate_market"
    ? {
        path: "/defi/lending/variable-rate/markets/detail",
        query: {
          network: "base",
          protocol: input.variable_rate_protocol,
          market_id: input.identifier,
        },
      }
    : {
        path: "/defi/lending/fixed-rate/markets/detail",
        query: {
          network: "base",
          protocol: "morpho_midnight",
          market_id: input.identifier,
        },
      };
}

export function validateTimeRange(
  from: string | undefined,
  to: string | undefined,
  label: string,
): void {
  if (from && to && Date.parse(to) < Date.parse(from)) {
    throw new ToolInputError(
      "invalid_time_range",
      `${label}_to must be later than or equal to ${label}_from.`,
      "fix_time_range",
    );
  }
}

function limitPositions(items: JsonRecord[], limit: number): JsonRecord[] {
  return limit === 0 ? items : items.slice(0, limit);
}
