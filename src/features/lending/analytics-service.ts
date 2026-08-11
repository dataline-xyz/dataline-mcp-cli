import type { DataApiClient } from "../../data-api/types.js";
import { ToolInputError } from "../../mcp/tool-result.js";
import { compactRecord, firstString, records, type JsonRecord } from "../shared/records.js";
import type {
  FixedRateOrderbookInput,
  FixedRateOrderbookOutput,
  LendingHistoryInput,
  LendingHistoryOutput,
} from "./analytics-schema.js";
import { VARIABLE_HISTORY_METRICS, VAULT_HISTORY_METRICS } from "./analytics-schema.js";
import { lendingSourceTime, lendingWarnings } from "./normalize.js";

const MARKET_ID_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export class LendingAnalyticsService {
  readonly #client: DataApiClient;

  constructor(client: DataApiClient) {
    this.#client = client;
  }

  async getHistory(input: LendingHistoryInput): Promise<LendingHistoryOutput> {
    validateHistoryInput(input);
    const request = historyRequest(input);
    const response = await this.#client.get<JsonRecord>(request.path, request.query);
    const rawPoints = records(response.data.points);
    const allPoints = rawPoints.flatMap((item) => {
      const timestamp = firstString(item.timestamp);
      if (!timestamp) return [];
      return [
        {
          timestamp,
          value: firstString(item.value) ?? null,
          is_missing: item.is_missing === true,
        },
      ];
    });
    const points = input.points_limit === 0 ? allPoints : allPoints.slice(-input.points_limit);
    return {
      product_type: input.product_type,
      identifier: input.identifier,
      protocol: requiredString(response.data.protocol, "protocol"),
      metric: requiredString(response.data.metric, "metric"),
      interval: input.interval,
      value_unit: requiredString(response.data.value_unit, "value_unit"),
      upstream_window: firstString(response.data.upstream_window) ?? null,
      start_time: requiredString(response.data.start_time, "start_time"),
      end_time: requiredString(response.data.end_time, "end_time"),
      includes_rewards: nullableBoolean(response.data.includes_rewards),
      fees_deducted: nullableBoolean(response.data.fees_deducted),
      available_points: allPoints.length,
      returned_points: points.length,
      truncated: points.length < allPoints.length,
      points,
      as_of: lendingSourceTime(response.data),
      warnings: lendingWarnings(response, rawPoints),
      errors: [],
    };
  }

  async getFixedRateOrderbook(input: FixedRateOrderbookInput): Promise<FixedRateOrderbookOutput> {
    const response = await this.#client.get<JsonRecord>(
      "/defi/lending/fixed-rate/markets/orderbook",
      {
        network: "base",
        protocol: "morpho_midnight",
        market_id: input.market_id,
        side: input.side,
        depth: input.depth,
      },
    );
    const rawBids = records(response.data.bids);
    const rawAsks = records(response.data.asks);
    return {
      protocol: "morpho_midnight",
      market_id: firstString(response.data.market_id) ?? input.market_id,
      side: input.side,
      depth: input.depth,
      detail_level: input.detail_level,
      bid_count: rawBids.length,
      ask_count: rawAsks.length,
      bids: rawBids.map((item) => orderbookLevel(item, input.detail_level)),
      asks: rawAsks.map((item) => orderbookLevel(item, input.detail_level)),
      time_to_maturity_seconds: nullableInteger(response.data.time_to_maturity_seconds),
      rate_calculation: requiredString(response.data.rate_calculation, "rate_calculation"),
      fees_included: response.data.fees_included === true,
      as_of: lendingSourceTime(response.data),
      warnings: lendingWarnings(response, [...rawBids, ...rawAsks]),
      errors: [],
    };
  }
}

function historyRequest(input: LendingHistoryInput): {
  path: string;
  query: Record<string, string | undefined>;
} {
  return input.product_type === "variable_rate_market"
    ? {
        path: "/defi/lending/variable-rate/markets/history",
        query: {
          network: "base",
          protocol: input.variable_rate_protocol,
          market_id: input.identifier,
          metric: input.metric,
          interval: input.interval,
          start_time: input.start_time,
          end_time: input.end_time,
        },
      }
    : {
        path: "/defi/lending/vaults/history",
        query: {
          vault_address: input.identifier,
          version: input.vault_version,
          metric: input.metric,
          interval: input.interval,
          start_time: input.start_time,
          end_time: input.end_time,
        },
      };
}

function validateHistoryInput(input: LendingHistoryInput): void {
  validateTimeRange(input.start_time, input.end_time);
  if (input.product_type === "vault") {
    if (!ADDRESS_PATTERN.test(input.identifier)) {
      throw new ToolInputError(
        "invalid_vault_address",
        "Vault history requires a 20-byte EVM vault address.",
        "use_vault_address_from_find_lending_vaults",
      );
    }
    if (!VAULT_HISTORY_METRICS.some((metric) => metric === input.metric)) {
      throw unsupportedMetric(input.product_type, input.metric, VAULT_HISTORY_METRICS);
    }
    return;
  }

  if (!MARKET_ID_PATTERN.test(input.identifier)) {
    throw new ToolInputError(
      "invalid_market_id",
      "Variable-rate history requires a 32-byte market ID.",
      "use_market_id_from_find_variable_rate_lending_markets",
    );
  }
  if (!VARIABLE_HISTORY_METRICS.some((metric) => metric === input.metric)) {
    throw unsupportedMetric(input.product_type, input.metric, VARIABLE_HISTORY_METRICS);
  }
  if (
    input.variable_rate_protocol === "aave_v3" &&
    input.metric !== "supplyApy" &&
    input.metric !== "borrowApy"
  ) {
    throw new ToolInputError(
      "unsupported_metric",
      "Aave V3 history currently supports only supplyApy and borrowApy.",
      "choose_supported_metric",
    );
  }
}

function unsupportedMetric(
  productType: LendingHistoryInput["product_type"],
  metric: string,
  supported: readonly string[],
): ToolInputError {
  return new ToolInputError(
    "unsupported_metric",
    `${metric} is not supported for ${productType}. Supported metrics: ${supported.join(", ")}.`,
    "choose_supported_metric",
  );
}

function validateTimeRange(from: string | undefined, to: string | undefined): void {
  if (from && to && Date.parse(to) < Date.parse(from)) {
    throw new ToolInputError(
      "invalid_time_range",
      "end_time must be later than or equal to start_time.",
      "fix_time_range",
    );
  }
}

function orderbookLevel(
  item: JsonRecord,
  level: "summary" | "detailed",
): FixedRateOrderbookOutput["bids"][number] {
  return compactRecord({
    price: firstString(item.price) ?? null,
    units: firstString(item.units) ?? null,
    implied_annualized_rate: firstString(item.implied_annualized_rate) ?? null,
    ...(level === "detailed"
      ? {
          tick: nullableInteger(item.tick),
          assets: firstString(item.assets) ?? null,
          count: nullableInteger(item.count),
        }
      : {}),
  }) as FixedRateOrderbookOutput["bids"][number];
}

function requiredString(value: unknown, field: string): string {
  const normalized = firstString(value);
  if (!normalized) {
    throw new Error(`Data API lending response is missing required field ${field}.`);
  }
  return normalized;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function nullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
