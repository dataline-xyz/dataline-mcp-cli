import { z } from "zod";

import { errorSchema, warningSchema } from "../shared/issues.js";

export const PERPETUAL_VENUES = ["binance", "bybit", "hyperliquid", "okx"] as const;
export const PERPETUAL_HISTORY_METRICS = ["funding_rate", "open_interest"] as const;
export const PERPETUAL_HISTORY_INTERVALS = ["5m", "15m", "30m", "1h", "4h", "1d"] as const;

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
  .describe("Quote or settle asset; defaults to USDT.");

export const perpetualMetricsInputSchema = {
  base: symbol,
  quote,
  venues: z
    .array(z.enum(PERPETUAL_VENUES))
    .max(PERPETUAL_VENUES.length)
    .default([])
    .describe("Derivatives venue filter; empty means all supported venues."),
};

export const perpetualHistoryInputSchema = {
  metric: z
    .enum(PERPETUAL_HISTORY_METRICS)
    .describe("Historical metric: funding_rate or open_interest."),
  base: symbol,
  venue: z.enum(PERPETUAL_VENUES),
  quote,
  interval: z
    .enum(PERPETUAL_HISTORY_INTERVALS)
    .default("1h")
    .describe("Sampling interval for open_interest; ignored for funding_rate."),
  limit: z.number().int().min(1).max(500).default(24),
  start_time: z.string().datetime({ offset: true }).optional(),
  end_time: z.string().datetime({ offset: true }).optional(),
};

const numberLikeSchema = z.union([z.number(), z.string(), z.null()]);
const perpetualMetricSchema = z.object({
  venue: z.string().optional(),
  symbol: z.string().optional(),
  quote: z.string().optional(),
  last: numberLikeSchema.optional(),
  bid: numberLikeSchema.optional(),
  ask: numberLikeSchema.optional(),
  mark: numberLikeSchema.optional(),
  index: numberLikeSchema.optional(),
  funding_rate: numberLikeSchema.optional(),
  annualized_funding_rate_pct: numberLikeSchema.optional(),
  next_funding_time: z.string().optional(),
  funding_interval_hours: numberLikeSchema.optional(),
  open_interest: numberLikeSchema.optional(),
  open_interest_usd: numberLikeSchema.optional(),
  volume_24h: numberLikeSchema.optional(),
  basis_bps: numberLikeSchema.optional(),
});

export const perpetualMetricsOutputSchema = {
  base: z.string(),
  quote: z.string(),
  as_of: z.string().nullable(),
  metrics: z.array(perpetualMetricSchema),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export const perpetualHistoryOutputSchema = {
  metric: z.enum(PERPETUAL_HISTORY_METRICS),
  base: z.string(),
  quote: z.string(),
  venue: z.enum(PERPETUAL_VENUES),
  interval: z.string().nullable(),
  funding_interval_hours: numberLikeSchema,
  columns: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  as_of: z.string().nullable(),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export type PerpetualMetricsInput = z.infer<z.ZodObject<typeof perpetualMetricsInputSchema>>;
export type PerpetualHistoryInput = z.infer<z.ZodObject<typeof perpetualHistoryInputSchema>>;
export type PerpetualMetricsOutput = z.infer<z.ZodObject<typeof perpetualMetricsOutputSchema>>;
export type PerpetualHistoryOutput = z.infer<z.ZodObject<typeof perpetualHistoryOutputSchema>>;
