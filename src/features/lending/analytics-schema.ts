import { z } from "zod";

import { errorSchema, warningSchema } from "../shared/issues.js";
import { LENDING_DETAIL_LEVELS, VARIABLE_RATE_PROTOCOLS, VAULT_DETAIL_VERSIONS } from "./schema.js";

export const LENDING_HISTORY_PRODUCT_TYPES = ["variable_rate_market", "vault"] as const;
export const VARIABLE_HISTORY_METRICS = [
  "supplyApy",
  "borrowApy",
  "totalSuppliedUsd",
  "totalBorrowedUsd",
  "liquidityUsd",
  "utilization",
  "assetPriceUsd",
] as const;
export const VAULT_HISTORY_METRICS = [
  "apy",
  "netApy",
  "totalAssetsUsd",
  "idleAssetsUsd",
  "sharePrice",
] as const;
export const LENDING_HISTORY_METRICS = [
  ...VARIABLE_HISTORY_METRICS,
  ...VAULT_HISTORY_METRICS,
] as const;
export const LENDING_HISTORY_INTERVALS = [
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
] as const;
export const ORDERBOOK_SIDES = ["bid", "ask", "all"] as const;

const detailLevel = z.enum(LENDING_DETAIL_LEVELS).default("summary");

export const lendingHistoryInputSchema = {
  product_type: z
    .enum(LENDING_HISTORY_PRODUCT_TYPES)
    .describe("Select variable-rate market history or vault history."),
  identifier: z
    .string()
    .trim()
    .min(1)
    .max(130)
    .describe("Market ID for a variable-rate market, or vault contract address for a vault."),
  variable_rate_protocol: z
    .enum(VARIABLE_RATE_PROTOCOLS)
    .default("morpho_blue")
    .describe("Used only for variable-rate market history."),
  vault_version: z
    .enum(VAULT_DETAIL_VERSIONS)
    .default("V2")
    .describe("Used only for vault history."),
  metric: z
    .enum(LENDING_HISTORY_METRICS)
    .optional()
    .describe(
      "Variable-rate metrics: supplyApy, borrowApy, totalSuppliedUsd, totalBorrowedUsd, liquidityUsd, utilization, assetPriceUsd. Vault metrics: apy, netApy, totalAssetsUsd, idleAssetsUsd, sharePrice. Omit to use supplyApy for a variable-rate market or netApy for a vault.",
    ),
  interval: z.enum(LENDING_HISTORY_INTERVALS).default("day"),
  start_time: z.string().datetime({ offset: true }).optional(),
  end_time: z.string().datetime({ offset: true }).optional(),
  points_limit: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .default(60)
    .describe(
      "Most recent points returned to the agent; defaults to 60. Set 0 only to return the full upstream series.",
    ),
};

const historyPointSchema = z.object({
  timestamp: z.string(),
  value: z.string().nullable(),
  is_missing: z.boolean(),
});

export const lendingHistoryOutputSchema = {
  product_type: z.enum(LENDING_HISTORY_PRODUCT_TYPES),
  identifier: z.string(),
  protocol: z.string(),
  metric: z.string(),
  interval: z.enum(LENDING_HISTORY_INTERVALS),
  value_unit: z.string(),
  upstream_window: z.string().nullable(),
  start_time: z.string(),
  end_time: z.string(),
  includes_rewards: z.boolean().nullable(),
  fees_deducted: z.boolean().nullable(),
  available_points: z.number().int(),
  returned_points: z.number().int(),
  truncated: z.boolean(),
  points: z.array(historyPointSchema),
  as_of: z.string().nullable(),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export const fixedRateOrderbookInputSchema = {
  market_id: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .describe("Morpho Midnight market ID from fixed-rate lending discovery."),
  side: z.enum(ORDERBOOK_SIDES).default("all"),
  depth: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Price levels requested per selected side; defaults to 20 and maximum 100."),
  detail_level: detailLevel.describe(
    "summary returns price, units, and implied rate; detailed also adds tick, assets, and offer count.",
  ),
};

const orderbookLevelSchema = z.object({
  price: z.string().nullable(),
  units: z.string().nullable(),
  implied_annualized_rate: z.string().nullable(),
  tick: z.number().int().nullable().optional(),
  assets: z.string().nullable().optional(),
  count: z.number().int().nullable().optional(),
});

export const fixedRateOrderbookOutputSchema = {
  protocol: z.literal("morpho_midnight"),
  market_id: z.string(),
  side: z.enum(ORDERBOOK_SIDES),
  depth: z.number().int(),
  detail_level: z.enum(LENDING_DETAIL_LEVELS),
  bid_count: z.number().int(),
  ask_count: z.number().int(),
  bids: z.array(orderbookLevelSchema),
  asks: z.array(orderbookLevelSchema),
  time_to_maturity_seconds: z.number().int().nullable(),
  rate_calculation: z.string(),
  fees_included: z.boolean(),
  as_of: z.string().nullable(),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export type LendingHistoryInput = z.infer<z.ZodObject<typeof lendingHistoryInputSchema>>;
export type LendingHistoryOutput = z.infer<z.ZodObject<typeof lendingHistoryOutputSchema>>;
export type FixedRateOrderbookInput = z.infer<z.ZodObject<typeof fixedRateOrderbookInputSchema>>;
export type FixedRateOrderbookOutput = z.infer<z.ZodObject<typeof fixedRateOrderbookOutputSchema>>;
