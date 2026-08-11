import type { DataApiResult } from "../../data-api/types.js";
import {
  collectWarnings,
  dedupeWarnings,
  warning,
  type ToolError,
  type ToolWarning,
} from "../shared/issues.js";
import {
  compactRecord,
  firstNumberLike,
  firstString,
  isRecord,
  records,
  type JsonRecord,
} from "../shared/records.js";
import type {
  AavePosition,
  BluePosition,
  FixedRateMarket,
  LendingAsset,
  LendingCollateral,
  LendingVault,
  MidnightPosition,
  VariableMarket,
} from "./schema.js";

type DetailLevel = "summary" | "detailed";
type VariableProtocol = "morpho_blue" | "aave_v3";

export interface NormalizedPositions {
  partial: boolean;
  protocolSummaries: Record<string, Record<string, string | number | null>>;
  blueItems: JsonRecord[];
  midnightItems: JsonRecord[];
  aaveItems: JsonRecord[];
  warnings: ToolWarning[];
  errors: ToolError[];
  sourceTime: string | null;
}

export function variableMarket(
  item: JsonRecord,
  level: DetailLevel,
  fallbackProtocol: VariableProtocol,
): VariableMarket | null {
  const marketId = firstString(item.market_id, item.marketId);
  if (!marketId) {
    return null;
  }
  const protocol = variableProtocol(item.protocol) ?? fallbackProtocol;
  return compactRecord({
    market_id: marketId,
    protocol,
    listed: optionalBoolean(item.listed),
    loan_asset: lendingAsset(item.loan_asset ?? item.loanAsset),
    collateral_asset: lendingAsset(item.collateral_asset ?? item.collateralAsset),
    total_supplied_usd: numberLike(item.total_supplied_usd),
    total_borrowed_usd: numberLike(item.total_borrowed_usd),
    available_liquidity_usd: numberLike(item.available_liquidity_usd),
    supply_apy: numberLike(item.supply_apy),
    net_supply_apy: numberLike(item.net_supply_apy),
    borrow_apy: numberLike(item.borrow_apy),
    net_borrow_apy: numberLike(item.net_borrow_apy),
    utilization: numberLike(item.utilization),
    ...(level === "detailed"
      ? {
          lltv: numberLike(item.lltv),
          reward_apr: numberLike(item.reward_apr),
          total_collateral_usd: numberLike(item.total_collateral_usd),
          market_fee: numberLike(item.market_fee),
          irm_address: firstString(item.irm_address),
          market_address: firstString(item.market_address),
          asset_price_usd: numberLike(item.asset_price_usd),
          liquidation_threshold: numberLike(item.liquidation_threshold),
          reserve_factor: numberLike(item.reserve_factor),
          supply_cap_reached: optionalBoolean(item.supply_cap_reached),
          borrow_cap_reached: optionalBoolean(item.borrow_cap_reached),
          collateral_enabled: optionalBoolean(item.collateral_enabled),
          borrowing_state: firstString(item.borrowing_state),
          is_frozen: optionalBoolean(item.is_frozen),
          is_paused: optionalBoolean(item.is_paused),
        }
      : {}),
  }) as VariableMarket;
}

export function lendingVault(item: JsonRecord, level: DetailLevel): LendingVault | null {
  const address = firstString(item.vault_address, item.address);
  const version = firstString(item.vault_version);
  if (!address || (version !== "V1" && version !== "V2")) {
    return null;
  }
  return compactRecord({
    vault_address: address,
    vault_version: version,
    name: firstString(item.name),
    symbol: firstString(item.symbol),
    asset: lendingAsset(item.asset),
    listed: optionalBoolean(item.listed),
    total_assets_usd: numberLike(item.total_assets_usd),
    liquidity_usd: numberLike(item.liquidity_usd),
    native_apy: numberLike(item.native_apy),
    net_apy: numberLike(item.net_apy),
    reward_apr: numberLike(item.reward_apr),
    ...(level === "detailed"
      ? {
          total_assets: numberLike(item.total_assets),
          total_supply: numberLike(item.total_supply),
          idle_assets_usd: numberLike(item.idle_assets_usd),
          performance_fee: numberLike(item.performance_fee),
          management_fee: numberLike(item.management_fee),
          allocation_count: arrayLength(item.allocations),
          reward_count: arrayLength(item.rewards),
        }
      : {}),
  }) as LendingVault;
}

export function fixedRateMarket(item: JsonRecord, level: DetailLevel): FixedRateMarket | null {
  const marketId = firstString(item.market_id, item.marketId);
  if (!marketId) {
    return null;
  }
  const rawCollaterals = records(item.collaterals);
  const collaterals = rawCollaterals.slice(0, 5).map(lendingCollateral);
  return compactRecord({
    market_id: marketId,
    loan_asset: lendingAsset(item.loan_asset ?? item.loan_token),
    collaterals,
    collateral_count: rawCollaterals.length,
    maturity: firstString(item.maturity),
    listed: optionalBoolean(item.listed),
    total_units: numberLike(item.total_units),
    time_to_maturity_seconds: optionalInteger(item.time_to_maturity_seconds),
    is_matured: optionalBoolean(item.is_matured),
    ...(level === "detailed"
      ? {
          best_bid: numberLike(item.best_bid),
          best_ask: numberLike(item.best_ask),
          implied_lend_rate: numberLike(item.implied_lend_rate),
          implied_borrow_rate: numberLike(item.implied_borrow_rate),
          bid_liquidity: numberLike(item.bid_liquidity),
          ask_liquidity: numberLike(item.ask_liquidity),
        }
      : {}),
  }) as FixedRateMarket;
}

export function normalizePositions(data: JsonRecord): NormalizedPositions {
  const results = data.protocol === "All" ? records(data.results) : [data];
  const blueItems = results.flatMap((result) =>
    result.protocol === "morpho_blue" ? records(result.blue_positions) : [],
  );
  const midnightItems = results.flatMap((result) =>
    result.protocol === "morpho_midnight" ? records(result.midnight_positions) : [],
  );
  const aaveItems = results.flatMap((result) =>
    result.protocol === "aave_v3" ? records(result.positions) : [],
  );
  const protocolSummaries = Object.fromEntries(
    results.flatMap((result) => {
      const protocol = firstString(result.protocol);
      return protocol ? [[protocol, positionSummary(result.summary)]] : [];
    }),
  );
  const warnings = dedupeWarnings(
    results.flatMap((result) =>
      stringArray(result.warnings).map((message) =>
        warning("lending_position_warning", message, {
          protocol: firstString(result.protocol),
        }),
      ),
    ),
  );
  const errors = records(data.errors).flatMap((item) => {
    const code = firstString(item.code);
    const message = firstString(item.message);
    if (!code || !message) {
      return [];
    }
    return [
      {
        code,
        message,
        retryable: item.retryable === true,
        details: compactRecord({ protocol: firstString(item.protocol) }),
      },
    ];
  });
  return {
    partial: data.partial === true || errors.length > 0,
    protocolSummaries,
    blueItems,
    midnightItems,
    aaveItems,
    warnings,
    errors,
    sourceTime: lendingSourceTime(data, results),
  };
}

export function bluePosition(item: JsonRecord, level: DetailLevel): BluePosition {
  const market = isRecord(item.market) ? item.market : {};
  return compactRecord({
    product: "Blue",
    position_types: stringArray(item.position_types),
    market_id: firstString(market.market_id, market.marketId),
    loan_asset: lendingAsset(market.loan_asset ?? market.loanAsset),
    collateral_asset: lendingAsset(market.collateral_asset ?? market.collateralAsset),
    supply_assets_usd: numberLike(item.supply_assets_usd),
    borrow_assets_usd: numberLike(item.borrow_assets_usd),
    collateral_usd: numberLike(item.collateral_usd),
    ...(level === "detailed"
      ? {
          supply_assets: numberLike(item.supply_assets),
          borrow_assets: numberLike(item.borrow_assets),
          collateral: numberLike(item.collateral),
        }
      : {}),
  }) as BluePosition;
}

export function midnightPosition(item: JsonRecord, level: DetailLevel): MidnightPosition {
  return compactRecord({
    product: "Midnight",
    position_types: stringArray(item.position_types),
    market_id: firstString(item.market_id, item.marketId),
    type: firstString(item.type),
    maturity: firstString(item.maturity),
    loan_token: firstString(item.loan_token),
    credit: numberLike(item.credit),
    debt: numberLike(item.debt),
    collateral_count: arrayLength(item.collaterals),
    ...(level === "detailed"
      ? {
          pending_fee: numberLike(item.pending_fee),
          effective_rate_wad: numberLike(item.effective_rate_wad),
        }
      : {}),
  }) as MidnightPosition;
}

export function aavePosition(item: JsonRecord, level: DetailLevel): AavePosition {
  return compactRecord({
    product: "Aave V3",
    position_types: stringArray(item.position_types),
    market_address: firstString(item.market_address),
    asset: lendingAsset(item.asset),
    supplied_usd: numberLike(item.supplied_usd),
    borrowed_usd: numberLike(item.borrowed_usd),
    collateral_enabled: optionalBoolean(item.collateral_enabled),
    supply_apy: numberLike(item.supply_apy),
    borrow_apy: numberLike(item.borrow_apy),
    ...(level === "detailed"
      ? {
          supplied: numberLike(item.supplied),
          borrowed: numberLike(item.borrowed),
        }
      : {}),
  }) as AavePosition;
}

export function lendingWarnings(
  response: DataApiResult<JsonRecord>,
  items: readonly JsonRecord[],
): ToolWarning[] {
  const messages = [
    ...stringArray(response.data.warnings),
    ...items.flatMap((item) => stringArray(item.warnings)),
  ];
  return dedupeWarnings([
    ...collectWarnings(response.warnings, response.data),
    ...items.flatMap((item) => collectWarnings([], item)),
    ...messages.map((message) => warning("lending_warning", message)),
  ]);
}

export function lendingSourceTime(
  data: JsonRecord,
  related: readonly JsonRecord[] = [],
): string | null {
  const sources = [data, ...related].flatMap(sourceRecords);
  for (const source of sources) {
    const value = firstString(source.fetched_at, source.source_timestamp);
    if (value) {
      return value;
    }
  }
  return null;
}

function sourceRecords(data: JsonRecord): JsonRecord[] {
  return [
    ...(isRecord(data.source) ? [data.source] : records(data.source)),
    ...records(data.sources),
  ];
}

function positionSummary(value: unknown): Record<string, string | number | null> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string | number | null] =>
        typeof entry[1] === "string" ||
        (typeof entry[1] === "number" && Number.isFinite(entry[1])) ||
        entry[1] === null,
    ),
  );
}

function lendingAsset(value: unknown): LendingAsset | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const asset = compactRecord({
    address: firstString(value.address),
    symbol: firstString(value.symbol),
    name: firstString(value.name),
    decimals: optionalInteger(value.decimals),
  }) as LendingAsset;
  return Object.keys(asset).length > 0 ? asset : undefined;
}

function lendingCollateral(value: JsonRecord): LendingCollateral {
  return compactRecord({
    ...lendingAsset(value),
    lltv: numberLike(value.lltv),
    liquidation_cursor: numberLike(value.liquidation_cursor),
  });
}

function variableProtocol(value: unknown): VariableProtocol | undefined {
  return value === "morpho_blue" || value === "aave_v3" ? value : undefined;
}

function numberLike(value: unknown): string | number | undefined {
  const normalized = firstNumberLike(value);
  return normalized === null ? undefined : normalized;
}

function optionalInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number(value);
  }
  return undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}
