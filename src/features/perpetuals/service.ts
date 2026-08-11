import type { DataApiClient, DataApiResult } from "../../data-api/types.js";
import { ToolInputError } from "../../mcp/tool-result.js";
import { collectWarnings, dedupeWarnings, unavailableWarnings } from "../shared/issues.js";
import {
  compactRecord,
  firstNumberLike,
  firstString,
  isRecord,
  records,
  sourceTime,
  type JsonRecord,
} from "../shared/records.js";
import type {
  PerpetualHistoryInput,
  PerpetualHistoryOutput,
  PerpetualMetricsInput,
  PerpetualMetricsOutput,
} from "./schema.js";

const FUNDING_COLUMNS = [
  "timestamp",
  "funding_rate",
  "annualized_funding_rate_pct",
  "mark_price",
  "premium",
] as const;
const OPEN_INTEREST_COLUMNS = ["timestamp", "open_interest", "open_interest_usd"] as const;

export class PerpetualsService {
  readonly #client: DataApiClient;

  constructor(client: DataApiClient) {
    this.#client = client;
  }

  async getMetrics(input: PerpetualMetricsInput): Promise<PerpetualMetricsOutput> {
    const base = input.base.trim().toUpperCase();
    const quote = input.quote.trim().toUpperCase();
    const response = await this.#client.get<JsonRecord>("/v1/crypto/perpetuals/metrics", {
      base,
      quote,
      venues: input.venues.length > 0 ? input.venues : undefined,
    });
    return metricsOutput(response, base, quote);
  }

  async getHistory(input: PerpetualHistoryInput): Promise<PerpetualHistoryOutput> {
    validateTimeRange(input.start_time, input.end_time);
    if (input.metric === "open_interest" && input.venue === "hyperliquid") {
      throw new ToolInputError(
        "feature_not_implemented",
        "Hyperliquid open-interest history is not available. Use binance, bybit, or okx.",
        "choose_supported_venue",
      );
    }

    const base = input.base.trim().toUpperCase();
    const quote = input.quote.trim().toUpperCase();
    const path =
      input.metric === "funding_rate"
        ? "/v1/crypto/perpetuals/funding-history"
        : "/v1/crypto/perpetuals/open-interest-history";
    const response = await this.#client.get<JsonRecord>(path, {
      base,
      quote,
      venue: input.venue,
      limit: input.limit,
      start_time: input.start_time,
      end_time: input.end_time,
      interval: input.metric === "open_interest" ? input.interval : undefined,
    });
    return historyOutput(response, input, base, quote);
  }
}

function validateTimeRange(startTime: string | undefined, endTime: string | undefined): void {
  if (startTime && endTime && Date.parse(endTime) < Date.parse(startTime)) {
    throw new ToolInputError(
      "invalid_time_range",
      "end_time must be later than or equal to start_time.",
      "fix_time_range",
    );
  }
}

function metricsOutput(
  response: DataApiResult<JsonRecord>,
  base: string,
  quote: string,
): PerpetualMetricsOutput {
  const metrics = records(response.data.metrics);
  return {
    base,
    quote,
    as_of: sourceTime(metrics),
    metrics: metrics.map(slimMetric),
    warnings: dedupeWarnings([
      ...collectWarnings(response.warnings, response.data),
      ...unavailableWarnings(response.data),
    ]),
    errors: [],
  };
}

function historyOutput(
  response: DataApiResult<JsonRecord>,
  input: PerpetualHistoryInput,
  base: string,
  quote: string,
): PerpetualHistoryOutput {
  const series = records(response.data.series);
  const firstSeries = series[0];
  const points = records(firstSeries?.points);
  const columns = input.metric === "funding_rate" ? FUNDING_COLUMNS : OPEN_INTEREST_COLUMNS;
  return {
    metric: input.metric,
    base,
    quote,
    venue: input.venue,
    interval:
      input.metric === "open_interest"
        ? (firstString(firstSeries?.interval) ?? input.interval)
        : null,
    funding_interval_hours:
      input.metric === "funding_rate" ? firstNumberLike(firstSeries?.funding_interval_hours) : null,
    columns: [...columns],
    rows: points.map((point) => columns.map((column) => point[column] ?? null)),
    as_of: sourceTime(series),
    warnings: dedupeWarnings([
      ...collectWarnings(response.warnings, response.data),
      ...unavailableWarnings(response.data, input.venue),
    ]),
    errors: [],
  };
}

function slimMetric(item: JsonRecord): Record<string, unknown> {
  const market = isRecord(item.market) ? item.market : {};
  const source = isRecord(item.source) ? item.source : {};
  return compactRecord({
    venue: firstString(market.venue, source.venue, source.provider),
    symbol: firstString(market.symbol, market.instrument_id),
    quote: firstString(market.quote),
    last: firstNumberLike(item.last),
    bid: firstNumberLike(item.bid),
    ask: firstNumberLike(item.ask),
    mark: firstNumberLike(item.mark),
    index: firstNumberLike(item.index),
    funding_rate: firstNumberLike(item.funding_rate),
    annualized_funding_rate_pct: firstNumberLike(item.annualized_funding_rate_pct),
    next_funding_time: firstString(item.next_funding_time),
    funding_interval_hours: firstNumberLike(item.funding_interval_hours),
    open_interest: firstNumberLike(item.open_interest),
    open_interest_usd: firstNumberLike(item.open_interest_usd),
    volume_24h: firstNumberLike(item.volume_24h),
    basis_bps: firstNumberLike(item.basis_bps),
  });
}
