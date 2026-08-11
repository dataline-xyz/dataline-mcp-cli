import type { DataApiClient, DataApiResult } from "../../data-api/types.js";
import { ToolInputError } from "../../mcp/tool-result.js";
import { collectWarnings, dedupeWarnings, unavailableWarnings, warning } from "../shared/issues.js";
import {
  compactRecord,
  decimalNumber,
  firstNumberLike,
  firstString,
  isRecord,
  records,
  sourceTime,
  type JsonRecord,
} from "../shared/records.js";
import type {
  CexPriceInput,
  CryptoOhlcvOutput,
  CryptoPriceOutput,
  DexPriceInput,
  OhlcvInput,
} from "./schema.js";

const LOW_QUOTE_VOLUME_24H = 1_000_000;
const VERY_LOW_QUOTE_VOLUME_24H = 100_000;
const LOW_LIQUIDITY_USD = 250_000;
const EXTREME_CHANGE_24H_PCT = 20;

const CHAIN_ALIASES: Readonly<Record<string, string>> = {
  eth: "ethereum",
  mainnet: "ethereum",
  arb: "arbitrum",
  op: "optimism",
  matic: "polygon",
  "polygon-pos": "polygon",
  bnb: "bsc",
  "binance-smart-chain": "bsc",
  sol: "solana",
};

const OHLCV_COLUMNS = [
  "open_time",
  "open",
  "high",
  "low",
  "close",
  "volume",
  "quote_volume",
  "close_time",
  "is_partial",
] as const;

export class CryptoService {
  readonly #client: DataApiClient;

  constructor(client: DataApiClient) {
    this.#client = client;
  }

  async getCexPrice(input: CexPriceInput): Promise<CryptoPriceOutput> {
    const base = input.base.trim().toUpperCase();
    const quote = input.quote.trim().toUpperCase();
    const response = await this.#client.get<JsonRecord>("/v1/crypto/cex/price", {
      base,
      quote,
      venues: input.venues.length > 0 ? input.venues : undefined,
      quote_notional: input.quote_notional,
    });
    return priceOutput(response, base, quote);
  }

  async getDexPrice(input: DexPriceInput): Promise<CryptoPriceOutput> {
    const chain = CHAIN_ALIASES[input.chain] ?? input.chain;
    const contractAddress = input.contract_address.trim();
    const response = await this.#client.get<JsonRecord>("/v1/crypto/dex/price", {
      chain,
      contract_address: contractAddress,
      venues: input.venues.length > 0 ? input.venues : undefined,
      quote_notional: input.quote_notional,
    });
    return priceOutput(response, contractAddress, "USD");
  }

  async getOhlcv(input: OhlcvInput): Promise<CryptoOhlcvOutput> {
    validateTimeRange(input.start_time, input.end_time);
    const base = input.base.trim().toUpperCase();
    const quote = input.quote.trim().toUpperCase();
    const response = await this.#client.get<JsonRecord>("/v1/crypto/history", {
      base,
      quote,
      venue: input.venue,
      market_type: input.market_type,
      interval: input.interval,
      limit: input.limit,
      start_time: input.start_time,
      end_time: input.end_time,
    });
    return ohlcvOutput(response, input, base, quote);
  }
}

function priceOutput(
  response: DataApiResult<JsonRecord>,
  fallbackSymbol: string,
  fallbackQuote: string,
): CryptoPriceOutput {
  const snapshots = records(response.data.snapshots);
  const firstSnapshot = snapshots[0];
  const market = firstSnapshot && isRecord(firstSnapshot.market) ? firstSnapshot.market : undefined;
  const confidence = isRecord(response.data.confidence) ? response.data.confidence : undefined;
  const confidenceVerdict = firstString(confidence?.verdict);
  const venues = snapshots.slice(0, 5).map(slimSnapshot);
  const warnings = dedupeWarnings([
    ...collectWarnings(response.warnings, response.data),
    ...unavailableWarnings(response.data),
    ...confidenceWarnings(confidenceVerdict),
    ...priceQualityWarnings(venues, fallbackQuote),
  ]);

  return {
    symbol: firstString(market?.base, response.data.base) ?? fallbackSymbol,
    quote: firstString(response.data.reference_quote, market?.quote) ?? fallbackQuote,
    price: firstNumberLike(
      response.data.reference_price,
      firstSnapshot?.mid,
      firstSnapshot?.last,
      firstSnapshot?.bid,
      firstSnapshot?.ask,
    ),
    as_of: sourceTime(snapshots),
    confidence: confidenceVerdict ?? null,
    venues,
    warnings,
    errors: [],
  };
}

function confidenceWarnings(verdict: string | undefined): ReturnType<typeof warning>[] {
  if (verdict === "unreliable") {
    return [
      {
        code: "unreliable_price_confidence",
        message:
          "Price confidence is unreliable; do not treat the reference price as actionable without more evidence.",
        severity: "critical",
      },
    ];
  }
  if (verdict === "borderline") {
    return [
      warning(
        "borderline_price_confidence",
        "Price confidence is borderline; use venue or depth-aware checks before acting.",
      ),
    ];
  }
  return [];
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

function ohlcvOutput(
  response: DataApiResult<JsonRecord>,
  input: OhlcvInput,
  base: string,
  quote: string,
): CryptoOhlcvOutput {
  const series = records(response.data.series);
  const firstSeries = series[0];
  const candles = records(firstSeries?.candles);
  return {
    symbol: base,
    quote,
    venue: input.venue,
    market_type: input.market_type,
    interval: firstString(firstSeries?.interval, response.data.interval) ?? input.interval,
    columns: [...OHLCV_COLUMNS],
    rows: candles.map((candle) => OHLCV_COLUMNS.map((column) => candle[column] ?? null)),
    as_of: sourceTime(series),
    warnings: dedupeWarnings([
      ...collectWarnings(response.warnings, response.data),
      ...unavailableWarnings(response.data, input.venue),
    ]),
    errors: [],
  };
}

function slimSnapshot(snapshot: JsonRecord): Record<string, unknown> {
  const market = isRecord(snapshot.market) ? snapshot.market : {};
  const source = isRecord(snapshot.source) ? snapshot.source : {};
  return compactRecord({
    venue: firstString(market.venue, source.venue, source.provider),
    price: firstNumberLike(snapshot.mid, snapshot.last, snapshot.bid),
    bid: firstNumberLike(snapshot.bid),
    ask: firstNumberLike(snapshot.ask),
    base_volume_24h: firstNumberLike(snapshot.base_volume_24h),
    quote_volume_24h: firstNumberLike(snapshot.quote_volume_24h),
    liquidity_usd: firstNumberLike(snapshot.liquidity_usd),
    change_24h_pct: firstNumberLike(snapshot.change_24h_pct),
  });
}

function priceQualityWarnings(
  venues: readonly Record<string, unknown>[],
  quote: string,
): ReturnType<typeof warning>[] {
  const output: ReturnType<typeof warning>[] = [];
  const quoteVolumes = numericValues(venues, "quote_volume_24h");
  const liquidities = numericValues(venues, "liquidity_usd");
  const changes = numericValues(venues, "change_24h_pct");

  if (quoteVolumes.length > 0) {
    const maximum = Math.max(...quoteVolumes);
    if (maximum < VERY_LOW_QUOTE_VOLUME_24H) {
      output.push(
        warning(
          "very_low_24h_quote_volume",
          "Returned venues show very low 24h quote volume; price may be thin.",
          { max_quote_volume_24h: maximum, threshold: VERY_LOW_QUOTE_VOLUME_24H, quote },
        ),
      );
    } else if (maximum < LOW_QUOTE_VOLUME_24H) {
      output.push(
        warning("low_24h_quote_volume", "Returned venues show low 24h quote volume.", {
          max_quote_volume_24h: maximum,
          threshold: LOW_QUOTE_VOLUME_24H,
          quote,
        }),
      );
    }
  }
  if (liquidities.length > 0 && Math.max(...liquidities) < LOW_LIQUIDITY_USD) {
    output.push(
      warning("low_liquidity", "Returned DEX pools show low liquidity.", {
        max_liquidity_usd: Math.max(...liquidities),
        threshold: LOW_LIQUIDITY_USD,
      }),
    );
  }
  if (changes.length > 0 && Math.max(...changes.map(Math.abs)) >= EXTREME_CHANGE_24H_PCT) {
    output.push(
      warning("extreme_24h_change", "A venue reports an unusually large 24h price move.", {
        max_abs_change_24h_pct: Math.max(...changes.map(Math.abs)),
        threshold: EXTREME_CHANGE_24H_PCT,
      }),
    );
  }
  return output;
}

function numericValues(items: readonly Record<string, unknown>[], key: string): number[] {
  return items.flatMap((item) => {
    const value = decimalNumber(item[key]);
    return value === undefined ? [] : [value];
  });
}
