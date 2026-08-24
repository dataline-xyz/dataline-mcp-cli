import type { DataApiClient } from "../../data-api/types.js";
import { ToolInputError } from "../../mcp/tool-result.js";
import { compactRecord, firstString, records, type JsonRecord } from "../shared/records.js";
import { isAaveMarketId, isEvmAddress, isMorphoMarketId } from "./identifiers.js";
import type {
  FixedRateOrderbookInput,
  FixedRateOrderbookOutput,
  LENDING_HISTORY_METRICS,
  LendingHistoryInput,
  LendingHistoryOutput,
} from "./analytics-schema.js";
import { VARIABLE_HISTORY_METRICS, VAULT_HISTORY_METRICS } from "./analytics-schema.js";
import { lendingSourceTime, lendingWarnings } from "./normalize.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY_RANGE_MS = 365 * DAY_MS;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export class LendingAnalyticsService {
  readonly #client: DataApiClient;

  constructor(client: DataApiClient) {
    this.#client = client;
  }

  async getHistory(input: LendingHistoryInput): Promise<LendingHistoryOutput> {
    const metric = historyMetric(input);
    validateHistoryInput(input, metric);
    const request = historyRequest(input, metric);
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

function historyRequest(
  input: LendingHistoryInput,
  metric: (typeof LENDING_HISTORY_METRICS)[number],
): {
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
          metric,
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
          metric,
          interval: input.interval,
          start_time: input.start_time,
          end_time: input.end_time,
        },
      };
}

function historyMetric(input: LendingHistoryInput): (typeof LENDING_HISTORY_METRICS)[number] {
  return input.metric ?? (input.product_type === "vault" ? "netApy" : "supplyApy");
}

function validateHistoryInput(
  input: LendingHistoryInput,
  metric: (typeof LENDING_HISTORY_METRICS)[number],
): void {
  validateTimeRange(input.start_time, input.end_time);
  if (input.product_type === "vault") {
    if (!isEvmAddress(input.identifier)) {
      throw new ToolInputError(
        "invalid_vault_address",
        "Vault history requires a 20-byte EVM vault address.",
        "use_vault_address_from_find_lending_vaults",
      );
    }
    if (!VAULT_HISTORY_METRICS.some((candidate) => candidate === metric)) {
      throw unsupportedMetric(input.product_type, metric, VAULT_HISTORY_METRICS);
    }
    return;
  }

  const validMarketId =
    input.variable_rate_protocol === "aave_v3"
      ? isAaveMarketId(input.identifier)
      : isMorphoMarketId(input.identifier);
  if (!validMarketId) {
    const expected =
      input.variable_rate_protocol === "aave_v3"
        ? "Aave history requires an underlying-token address or market:token identifier."
        : "Morpho variable-rate history requires a 32-byte market ID.";
    throw new ToolInputError(
      "invalid_market_id",
      expected,
      "use_market_id_from_find_variable_rate_lending_markets",
    );
  }
  if (!VARIABLE_HISTORY_METRICS.some((candidate) => candidate === metric)) {
    throw unsupportedMetric(input.product_type, metric, VARIABLE_HISTORY_METRICS);
  }
  if (
    input.variable_rate_protocol === "aave_v3" &&
    metric !== "supplyApy" &&
    metric !== "borrowApy"
  ) {
    throw new ToolInputError(
      "unsupported_metric",
      "Aave V3 history currently supports only supplyApy and borrowApy.",
      "choose_supported_metric",
    );
  }
  if (input.variable_rate_protocol === "aave_v3") {
    validateAaveHistoryRange(input.start_time, input.end_time);
  }
}

function unsupportedMetric(
  productType: LendingHistoryInput["product_type"],
  metric: (typeof LENDING_HISTORY_METRICS)[number],
  supported: readonly string[],
): ToolInputError {
  return new ToolInputError(
    "unsupported_metric",
    `${metric} is not supported for ${productType}. Supported metrics: ${supported.join(", ")}.`,
    "choose_supported_metric",
  );
}

function validateTimeRange(from: string | undefined, to: string | undefined): void {
  const end = to ? Date.parse(to) : Date.now();
  const start = from ? Date.parse(from) : end - 30 * DAY_MS;
  if (end <= start) {
    throw new ToolInputError(
      "invalid_time_range",
      "end_time must be later than start_time.",
      "fix_time_range",
    );
  }
  if (end - start > MAX_HISTORY_RANGE_MS) {
    throw new ToolInputError(
      "history_range_too_large",
      "History range cannot exceed 365 days.",
      "reduce_history_range",
    );
  }
}

function validateAaveHistoryRange(from: string | undefined, to: string | undefined): void {
  const now = Date.now();
  const end = to ? Date.parse(to) : now;
  const start = from ? Date.parse(from) : end - 30 * DAY_MS;
  if (start > now) {
    throw new ToolInputError(
      "history_starts_in_future",
      "Aave V3 history cannot start in the future.",
      "choose_past_time_range",
    );
  }
  if (end > now + FUTURE_TOLERANCE_MS) {
    throw new ToolInputError(
      "history_ends_in_future",
      "Aave V3 history cannot end in the future.",
      "choose_past_time_range",
    );
  }
  if (start < now - MAX_HISTORY_RANGE_MS) {
    throw new ToolInputError(
      "history_too_old",
      "Aave V3 history is limited to the trailing 365 days.",
      "choose_recent_time_range",
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
