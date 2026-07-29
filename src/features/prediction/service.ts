import type { DataApiClient, DataApiResult } from "../../data-api/types.js";
import { ToolInputError } from "../../mcp/tool-result.js";
import { collectWarnings } from "../shared/issues.js";
import {
  compactRecord,
  firstNumberLike,
  firstString,
  isRecord,
  records,
  type JsonRecord,
} from "../shared/records.js";
import type {
  PredictionDetailInput,
  PredictionDetailOutput,
  PredictionSearchInput,
  PredictionSearchOutput,
} from "./schema.js";

export class PredictionService {
  readonly #client: DataApiClient;

  constructor(client: DataApiClient) {
    this.#client = client;
  }

  async search(input: PredictionSearchInput): Promise<PredictionSearchOutput> {
    const response = await this.#client.get<unknown>("/prediction/events/list", {
      category: input.category,
      query: input.query || undefined,
      page: input.page,
      limit: input.limit,
      is_active: activeStatus(input.active_status),
      sort: input.sort,
      order: input.order,
    });
    return searchOutput(response, input);
  }

  async get(input: PredictionDetailInput): Promise<PredictionDetailOutput> {
    const slug = input.slug.trim();
    const eventId = input.event_id > 0 ? input.event_id : undefined;
    if (!slug && eventId === undefined) {
      throw new ToolInputError(
        "prediction_event_needs_id",
        "Provide a Polymarket slug from the event URL, or event_id from find_prediction_events.",
      );
    }

    const response = await this.#client.get<JsonRecord>("/prediction/events/detail", {
      slug: slug || undefined,
      event_id: slug ? undefined : eventId,
    });
    return detailOutput(response, input);
  }
}

function searchOutput(
  response: DataApiResult<unknown>,
  input: PredictionSearchInput,
): PredictionSearchOutput {
  const events = records(response.data).slice(0, input.limit).map(slimEvent);
  return {
    category: input.category,
    active_status: input.active_status,
    sort: input.sort,
    order: input.order,
    page: input.page,
    limit: input.limit,
    count: events.length,
    next_page: events.length >= input.limit ? input.page + 1 : null,
    events,
    warnings: collectWarnings(response.warnings, response.data),
    errors: [],
  };
}

function detailOutput(
  response: DataApiResult<JsonRecord>,
  input: PredictionDetailInput,
): PredictionDetailOutput {
  const data = response.data;
  const allMarkets = marketsFrom(data).sort((left, right) =>
    compareMarkets(left, right, input.market_sort),
  );
  const selected = allMarkets.slice(
    input.markets_offset,
    input.markets_offset + input.markets_limit,
  );
  const nextOffset = input.markets_offset + selected.length;
  return {
    event: slimEvent(data),
    markets_offset: input.markets_offset,
    market_sort: input.market_sort,
    markets_total: allMarkets.length,
    markets_returned: selected.length,
    markets_next_offset: selected.length > 0 && nextOffset < allMarkets.length ? nextOffset : null,
    rules: rules(data.rules),
    url: urlValue(data.url),
    outcomes: outcomes(data.outcomes),
    markets: selected.map(slimMarket),
    warnings: collectWarnings(response.warnings, data),
    errors: [],
  };
}

function slimEvent(item: JsonRecord): PredictionSearchOutput["events"][number] {
  const status = firstString(item.status);
  return compactRecord({
    provider: firstString(item.provider),
    event_id: positiveInteger(item.event_id) ?? 0,
    slug: stringValue(item.slug),
    category: stringValue(item.category),
    title: stringValue(item.title) ?? "Untitled prediction event",
    status,
    volume: optionalNumberLike(item.volume),
    volume_24h: optionalNumberLike(item.volume_24h),
    open_interest: optionalNumberLike(item.open_interest),
    liquidity: optionalNumberLike(item.liquidity),
    market_count: optionalInteger(item.market_count),
    open_time: stringValue(item.open_time),
    close_time: stringValue(item.close_time),
    expiration_time: stringValue(item.expiration_time),
    is_active: typeof item.is_active === "boolean" ? item.is_active : status === "open",
    url: urlValue(item.url),
  }) as PredictionSearchOutput["events"][number];
}

function slimMarket(item: JsonRecord): PredictionDetailOutput["markets"][number] {
  const status = stringValue(item.status);
  return compactRecord({
    market_id: stringValue(item.id ?? item.market_id),
    slug: stringValue(item.slug),
    title: trimString(item.title, 300),
    sub_title: trimString(item.sub_title, 300),
    status,
    is_active:
      typeof item.is_active === "boolean"
        ? item.is_active
        : status === undefined
          ? undefined
          : status === "open",
    trading_enabled: booleanValue(item.trading_enabled),
    outcome_type: stringValue(item.outcome_type),
    best_yes_bid: optionalNumberLike(item.best_yes_bid ?? item.best_bid),
    best_yes_ask: optionalNumberLike(item.best_yes_ask ?? item.best_ask),
    best_no_ask: optionalNumberLike(item.best_no_ask),
    last_trade_price: optionalNumberLike(item.last_trade_price),
    outcomes: marketOutcomes(item),
    volume: optionalNumberLike(item.volume),
    volume_24h: optionalNumberLike(item.volume_24h),
    open_interest: optionalNumberLike(item.open_interest),
    liquidity: optionalNumberLike(item.liquidity),
    close_time: stringValue(item.close_time ?? item.end_time ?? item.expiration_time),
    rules_summary: marketRules(item.rules),
    url: urlValue(item.url),
  }) as PredictionDetailOutput["markets"][number];
}

function marketsFrom(data: JsonRecord): JsonRecord[] {
  if (Array.isArray(data.markets)) {
    return records(data.markets);
  }
  if (!isRecord(data.markets)) {
    return [];
  }
  const preferred = data.markets.polymarket;
  if (Array.isArray(preferred)) {
    return records(preferred);
  }
  for (const value of Object.values(data.markets)) {
    if (Array.isArray(value)) {
      return records(value);
    }
  }
  return [];
}

function compareMarkets(
  left: JsonRecord,
  right: JsonRecord,
  sort: PredictionDetailInput["market_sort"],
): number {
  if (sort === "close_time") {
    return timeValue(left) - timeValue(right);
  }
  return marketSortValue(right, sort) - marketSortValue(left, sort);
}

function marketSortValue(item: JsonRecord, sort: PredictionDetailInput["market_sort"]): number {
  if (sort === "volume_24h") return numericValue(item.volume_24h);
  if (sort === "volume") return numericValue(item.volume);
  if (sort === "liquidity") return numericValue(item.liquidity);
  return numericValue(item.best_yes_ask ?? item.best_ask ?? item.best_yes_bid ?? item.best_bid);
}

function timeValue(item: JsonRecord): number {
  const value = stringValue(item.close_time ?? item.end_time ?? item.expiration_time);
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function marketOutcomes(item: JsonRecord): PredictionDetailOutput["markets"][number]["outcomes"] {
  const raw = item.outcomes;
  if (Array.isArray(raw) && raw.every(isRecord)) {
    return raw.slice(0, 8).map((value) =>
      compactRecord({
        label: stringValue(value.label ?? value.outcome_key),
        price: optionalNumberLike(value.price),
      }),
    );
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  const prices = Array.isArray(item.outcome_prices) ? item.outcome_prices : [];
  return raw.slice(0, 8).map((label, index) =>
    compactRecord({
      label: String(label),
      price: optionalNumberLike(prices[index]),
    }),
  );
}

function outcomes(value: unknown): PredictionDetailOutput["outcomes"] {
  return records(value)
    .slice(0, 12)
    .map((item) =>
      compactRecord({
        label: stringValue(item.label ?? item.outcome_key ?? item.name),
        price: optionalNumberLike(item.price ?? item.probability),
      }),
    );
}

function rules(value: unknown): PredictionDetailOutput["rules"] {
  if (typeof value === "string") {
    const primary = trimString(value, 1200);
    return primary ? [{ rules_primary: primary }] : [];
  }
  return records(value)
    .slice(0, 3)
    .map((item) =>
      compactRecord({
        rules_primary: trimString(item.rules_primary, 1200),
        rules_secondary: trimString(item.rules_secondary, 800),
      }),
    );
}

function marketRules(value: unknown): string | undefined {
  if (typeof value === "string") {
    return trimString(value, 900);
  }
  return isRecord(value)
    ? trimString(value.rules_primary ?? value.rules_secondary, 900)
    : undefined;
}

function activeStatus(value: PredictionSearchInput["active_status"]): boolean | undefined {
  if (value === "active") return true;
  if (value === "inactive") return false;
  return undefined;
}

function urlValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return stringValue(value);
  }
  if (!isRecord(value)) {
    return undefined;
  }
  return firstString(value.polymarket, value.url, value.href, ...Object.values(value));
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function optionalNumberLike(value: unknown): string | number | undefined {
  return firstNumberLike(value) ?? undefined;
}

function numericValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    return undefined;
  }
  const text = String(value).trim();
  return text || undefined;
}

function trimString(value: unknown, limit: number): string | undefined {
  const text = stringValue(value);
  if (!text) {
    return undefined;
  }
  return text.length <= limit ? text : `${text.slice(0, limit - 3).trimEnd()}...`;
}
