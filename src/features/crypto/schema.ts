import { z } from "zod";

import { errorSchema, warningSchema } from "../shared/issues.js";

export const CEX_VENUES = ["binance", "bybit", "coinbase", "okx"] as const;
export const DEX_VENUES = ["dexscreener", "geckoterminal"] as const;
export const HISTORICAL_VENUES = ["binance", "bybit", "coinbase", "hyperliquid", "okx"] as const;
export const DEX_CHAINS = [
  "ethereum",
  "eth",
  "mainnet",
  "base",
  "arbitrum",
  "arb",
  "optimism",
  "op",
  "polygon",
  "polygon-pos",
  "matic",
  "bsc",
  "bnb",
  "binance-smart-chain",
  "solana",
  "sol",
] as const;
export const MARKET_TYPES = ["spot", "perpetual"] as const;
export const OHLCV_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

const symbol = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9]+$/)
  .describe("Asset ticker such as BTC, ETH, or SOL.");
const quote = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[A-Za-z0-9]+$/)
  .default("USDT")
  .describe("Quote asset; defaults to USDT.");
const quoteNotional = z
  .number()
  .positive()
  .max(1_000_000_000)
  .optional()
  .describe("Optional quote-currency trade size for confidence checks.");

export const cexPriceInputSchema = {
  base: symbol,
  quote,
  venues: z
    .array(z.enum(CEX_VENUES))
    .max(CEX_VENUES.length)
    .default([])
    .describe("CEX filter; empty means all supported CEX venues."),
  quote_notional: quoteNotional,
};

export const dexPriceInputSchema = {
  chain: z.enum(DEX_CHAINS).describe("Token network. Common aliases are accepted and normalized."),
  contract_address: z
    .string()
    .trim()
    .min(32)
    .max(128)
    .describe("Token contract address on the selected chain."),
  venues: z
    .array(z.enum(DEX_VENUES))
    .max(DEX_VENUES.length)
    .default([])
    .describe("DEX provider filter; empty means all supported providers."),
  quote_notional: quoteNotional,
};

export const ohlcvInputSchema = {
  base: symbol,
  venue: z.enum(HISTORICAL_VENUES).default("binance").describe("Candle source venue."),
  quote,
  market_type: z.enum(MARKET_TYPES).default("spot"),
  interval: z.enum(OHLCV_INTERVALS).default("1h"),
  limit: z.number().int().min(1).max(1000).default(100),
  start_time: z.string().datetime({ offset: true }).optional(),
  end_time: z.string().datetime({ offset: true }).optional(),
};

const numberLikeSchema = z.union([z.number(), z.string(), z.null()]);
const priceVenueSchema = z.object({
  venue: z.string().optional(),
  price: numberLikeSchema.optional(),
  bid: numberLikeSchema.optional(),
  ask: numberLikeSchema.optional(),
  base_volume_24h: numberLikeSchema.optional(),
  quote_volume_24h: numberLikeSchema.optional(),
  liquidity_usd: numberLikeSchema.optional(),
  change_24h_pct: numberLikeSchema.optional(),
});

export const cryptoPriceOutputSchema = {
  symbol: z.string(),
  quote: z.string(),
  price: numberLikeSchema,
  as_of: z.string().nullable(),
  confidence: z.string().nullable(),
  venues: z.array(priceVenueSchema),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export const cryptoOhlcvOutputSchema = {
  symbol: z.string(),
  quote: z.string(),
  venue: z.string(),
  market_type: z.enum(MARKET_TYPES),
  interval: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  as_of: z.string().nullable(),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export type CexPriceInput = z.infer<z.ZodObject<typeof cexPriceInputSchema>>;
export type DexPriceInput = z.infer<z.ZodObject<typeof dexPriceInputSchema>>;
export type OhlcvInput = z.infer<z.ZodObject<typeof ohlcvInputSchema>>;
export type CryptoPriceOutput = z.infer<z.ZodObject<typeof cryptoPriceOutputSchema>>;
export type CryptoOhlcvOutput = z.infer<z.ZodObject<typeof cryptoOhlcvOutputSchema>>;
