import { z } from "zod";

import { errorSchema, warningSchema } from "../shared/issues.js";

export const DEFI_BASE_DEXES = [
  "aerodrome-base",
  "aerodrome-slipstream",
  "aerodrome-slipstream-2",
  "uniswap-v3-base",
  "pancakeswap-v3-base",
  "baseswap",
  "sushiswap-v3-base",
  "alien-base",
  "balancer-base",
  "maverick-protocol-base",
] as const;
export const DEFI_POOL_SORTS = [
  "reserve_in_usd_desc",
  "reserve_in_usd_asc",
  "fdv_usd_desc",
  "fdv_usd_asc",
  "price_desc",
  "price_asc",
  "pool_created_at_desc",
] as const;
export const DEFI_NETWORKS = ["base", "all"] as const;

export const defiPoolListInputSchema = {
  dexes: z
    .array(z.enum(DEFI_BASE_DEXES))
    .max(DEFI_BASE_DEXES.length)
    .default([])
    .describe("Optional Base DEX filters; empty means all supported DEXs."),
  sort: z.enum(DEFI_POOL_SORTS).default("reserve_in_usd_desc"),
  page: z.number().int().min(1).default(1),
};

export const defiPoolSearchInputSchema = {
  query: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .describe("Pool address, token contract address, token symbol, or token name."),
  network: z.enum(DEFI_NETWORKS).default("base"),
  page: z.number().int().min(1).default(1),
};

const poolSchema = z.object({
  pool_id: z.string(),
  network: z.string().optional(),
  address: z.string().optional(),
  name: z.string().optional(),
  dex_id: z.string().optional(),
  base_token_id: z.string().optional(),
  quote_token_id: z.string().optional(),
  base_token_price_usd: z.string().optional(),
  quote_token_price_usd: z.string().optional(),
  reserve_in_usd: z.string().optional(),
  fdv_usd: z.string().optional(),
  market_cap_usd: z.string().optional(),
  pool_created_at: z.string().optional(),
});

export const defiPoolListOutputSchema = {
  network: z.literal("base"),
  dexes: z.array(z.enum(DEFI_BASE_DEXES)),
  sort: z.enum(DEFI_POOL_SORTS),
  page: z.number().int(),
  count: z.number().int(),
  next_page: z.number().int().nullable(),
  pools: z.array(poolSchema),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export const defiPoolSearchOutputSchema = {
  query: z.string(),
  network: z.enum(DEFI_NETWORKS),
  page: z.number().int(),
  count: z.number().int(),
  next_page: z.number().int().nullable(),
  pools: z.array(poolSchema),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export type DefiPoolListInput = z.infer<z.ZodObject<typeof defiPoolListInputSchema>>;
export type DefiPoolSearchInput = z.infer<z.ZodObject<typeof defiPoolSearchInputSchema>>;
export type DefiPoolListOutput = z.infer<z.ZodObject<typeof defiPoolListOutputSchema>>;
export type DefiPoolSearchOutput = z.infer<z.ZodObject<typeof defiPoolSearchOutputSchema>>;
