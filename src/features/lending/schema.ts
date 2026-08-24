import { z } from "zod";

import { errorSchema, warningSchema } from "../shared/issues.js";

export const LENDING_DETAIL_LEVELS = ["summary", "detailed"] as const;
export const LENDING_SORT_ORDERS = ["desc", "asc"] as const;
export const VARIABLE_RATE_PROTOCOLS = ["morpho_blue", "aave_v3"] as const;
export const VARIABLE_MARKET_SORTS = [
  "supplyUsd",
  "borrowUsd",
  "liquidityUsd",
  "supplyApy",
  "borrowApy",
  "utilization",
] as const;
export const VAULT_VERSIONS = ["V2", "V1"] as const;
export const VAULT_DETAIL_VERSIONS = ["V2", "V1"] as const;
export const VAULT_SORTS = ["totalAssetsUsd", "liquidityUsd", "apy", "netApy"] as const;
export const FIXED_MARKET_SORTS = ["totalUnits", "maturity"] as const;
export const LENDING_PRODUCT_TYPES = [
  "variable_rate_market",
  "vault",
  "fixed_rate_market",
] as const;
export const LENDING_ACCOUNT_PROTOCOLS = [
  "All",
  "morpho_blue",
  "morpho_midnight",
  "aave_v3",
] as const;
export const LENDING_POSITION_TYPES = ["All", "Supply", "Borrow", "Collateral", "Lend"] as const;

const evmAddress = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Base token or vault contract address; symbols are not accepted by Data API.");
const listLimit = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(5)
  .describe(
    "Returned items; defaults to 5 to protect agent context. Increase deliberately, up to 100.",
  );
const detailLevel = z
  .enum(LENDING_DETAIL_LEVELS)
  .default("summary")
  .describe(
    "summary keeps decision fields; detailed adds curated metrics without raw provider data.",
  );

export const variableMarketSearchInputSchema = {
  protocol: z
    .enum(VARIABLE_RATE_PROTOCOLS)
    .default("morpho_blue")
    .describe("Variable-rate protocol on Base: Morpho Blue or Aave V3."),
  loan_asset_address: evmAddress.optional(),
  collateral_asset_address: evmAddress
    .describe("Optional collateral token address; supported only for Morpho Blue markets.")
    .optional(),
  sort: z.enum(VARIABLE_MARKET_SORTS).default("supplyUsd"),
  order: z.enum(LENDING_SORT_ORDERS).default("desc"),
  limit: listLimit,
  offset: z.number().int().min(0).max(999).default(0),
  detail_level: detailLevel,
};

export const lendingVaultSearchInputSchema = {
  asset_address: evmAddress.optional(),
  version: z.enum(VAULT_VERSIONS).default("V2"),
  sort: z.enum(VAULT_SORTS).default("totalAssetsUsd"),
  order: z.enum(LENDING_SORT_ORDERS).default("desc"),
  limit: listLimit,
  offset: z.number().int().min(0).max(999).default(0),
  detail_level: detailLevel,
};

export const fixedMarketSearchInputSchema = {
  loan_asset_address: evmAddress.optional(),
  collateral_asset_address: evmAddress.optional(),
  maturity_from: z.string().datetime({ offset: true }).optional(),
  maturity_to: z.string().datetime({ offset: true }).optional(),
  sort: z.enum(FIXED_MARKET_SORTS).default("totalUnits"),
  order: z.enum(LENDING_SORT_ORDERS).default("desc"),
  limit: listLimit,
  cursor: z.string().trim().min(1).max(4096).optional(),
  detail_level: detailLevel,
};

export const lendingProductDetailInputSchema = {
  product_type: z
    .enum(LENDING_PRODUCT_TYPES)
    .describe("Selects variable-rate market, vault, or fixed-rate market detail."),
  identifier: z
    .string()
    .trim()
    .min(1)
    .max(130)
    .describe(
      "Morpho market ID, Aave underlying-token or market:token ID, or vault address, as returned by a lending discovery tool.",
    ),
  variable_rate_protocol: z
    .enum(VARIABLE_RATE_PROTOCOLS)
    .default("morpho_blue")
    .describe("Used only when product_type=variable_rate_market."),
  vault_version: z.enum(VAULT_DETAIL_VERSIONS).default("V2"),
  detail_level: detailLevel,
};

export const lendingPositionsInputSchema = {
  wallet_address: evmAddress.describe(
    "Base wallet address whose public lending positions to read.",
  ),
  protocol: z
    .enum(LENDING_ACCOUNT_PROTOCOLS)
    .default("All")
    .describe("Query one lending protocol or all supported protocols in one Data API request."),
  position_type: z.enum(LENDING_POSITION_TYPES).default("All"),
  positions_per_product: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(10)
    .describe(
      "Maximum positions returned for each product family; defaults to 10. Set 0 only when the full result is worth the added agent context.",
    ),
  detail_level: detailLevel,
};

const numberLikeSchema = z.union([z.number(), z.string(), z.null()]);
const assetSchema = z.object({
  address: z.string().optional(),
  symbol: z.string().optional(),
  name: z.string().optional(),
  decimals: z.number().int().optional(),
});
const collateralSchema = assetSchema.extend({
  lltv: numberLikeSchema.optional(),
  liquidation_cursor: numberLikeSchema.optional(),
});

const variableMarketSchema = z.object({
  market_id: z.string(),
  protocol: z.enum(VARIABLE_RATE_PROTOCOLS),
  listed: z.boolean().optional(),
  loan_asset: assetSchema.optional(),
  collateral_asset: assetSchema.optional(),
  total_supplied_usd: numberLikeSchema.optional(),
  total_borrowed_usd: numberLikeSchema.optional(),
  available_liquidity_usd: numberLikeSchema.optional(),
  supply_apy: numberLikeSchema.optional(),
  net_supply_apy: numberLikeSchema.optional(),
  borrow_apy: numberLikeSchema.optional(),
  net_borrow_apy: numberLikeSchema.optional(),
  utilization: numberLikeSchema.optional(),
  lltv: numberLikeSchema.optional(),
  reward_apr: numberLikeSchema.optional(),
  total_collateral_usd: numberLikeSchema.optional(),
  market_fee: numberLikeSchema.optional(),
  irm_address: z.string().optional(),
  market_address: z.string().optional(),
  asset_price_usd: numberLikeSchema.optional(),
  liquidation_threshold: numberLikeSchema.optional(),
  reserve_factor: numberLikeSchema.optional(),
  supply_cap_reached: z.boolean().optional(),
  borrow_cap_reached: z.boolean().optional(),
  collateral_enabled: z.boolean().optional(),
  borrowing_state: z.string().optional(),
  is_frozen: z.boolean().optional(),
  is_paused: z.boolean().optional(),
});

const vaultSchema = z.object({
  vault_address: z.string(),
  vault_version: z.enum(VAULT_DETAIL_VERSIONS),
  name: z.string().optional(),
  symbol: z.string().optional(),
  asset: assetSchema.optional(),
  listed: z.boolean().optional(),
  total_assets_usd: numberLikeSchema.optional(),
  liquidity_usd: numberLikeSchema.optional(),
  native_apy: numberLikeSchema.optional(),
  net_apy: numberLikeSchema.optional(),
  reward_apr: numberLikeSchema.optional(),
  total_assets: numberLikeSchema.optional(),
  total_supply: numberLikeSchema.optional(),
  idle_assets_usd: numberLikeSchema.optional(),
  performance_fee: numberLikeSchema.optional(),
  management_fee: numberLikeSchema.optional(),
  allocation_count: z.number().int().optional(),
  reward_count: z.number().int().optional(),
});

const fixedMarketSchema = z.object({
  market_id: z.string(),
  loan_asset: assetSchema.optional(),
  collaterals: z.array(collateralSchema),
  collateral_count: z.number().int(),
  maturity: z.string().optional(),
  listed: z.boolean().optional(),
  total_units: numberLikeSchema.optional(),
  time_to_maturity_seconds: z.number().int().optional(),
  is_matured: z.boolean().optional(),
  best_bid: numberLikeSchema.optional(),
  best_ask: numberLikeSchema.optional(),
  implied_lend_rate: numberLikeSchema.optional(),
  implied_borrow_rate: numberLikeSchema.optional(),
  bid_liquidity: numberLikeSchema.optional(),
  ask_liquidity: numberLikeSchema.optional(),
});

const commonListOutput = {
  detail_level: z.enum(LENDING_DETAIL_LEVELS),
  count: z.number().int().describe("Number of items returned on this page, not a total count."),
  limit: z.number().int(),
  has_more: z.boolean(),
  as_of: z.string().nullable(),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export const variableMarketSearchOutputSchema = {
  ...commonListOutput,
  offset: z.number().int(),
  next_offset: z.number().int().nullable(),
  markets: z.array(variableMarketSchema),
};

export const lendingVaultSearchOutputSchema = {
  ...commonListOutput,
  version: z.enum(VAULT_VERSIONS),
  offset: z.number().int(),
  next_offset: z.number().int().nullable(),
  vaults: z.array(vaultSchema),
};

export const fixedMarketSearchOutputSchema = {
  ...commonListOutput,
  cursor: z.string().nullable(),
  next_cursor: z.string().nullable(),
  markets: z.array(fixedMarketSchema),
};

export const lendingProductDetailOutputSchema = {
  product_type: z.enum(LENDING_PRODUCT_TYPES),
  identifier: z.string(),
  detail_level: z.enum(LENDING_DETAIL_LEVELS),
  variable_rate_market: variableMarketSchema.optional(),
  vault: vaultSchema.optional(),
  fixed_rate_market: fixedMarketSchema.optional(),
  as_of: z.string().nullable(),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

const summarySchema = z.record(z.string(), numberLikeSchema);
const bluePositionSchema = z.object({
  product: z.literal("Blue"),
  position_types: z.array(z.string()),
  market_id: z.string().optional(),
  loan_asset: assetSchema.optional(),
  collateral_asset: assetSchema.optional(),
  supply_assets: numberLikeSchema.optional(),
  supply_assets_usd: numberLikeSchema.optional(),
  borrow_assets: numberLikeSchema.optional(),
  borrow_assets_usd: numberLikeSchema.optional(),
  collateral: numberLikeSchema.optional(),
  collateral_usd: numberLikeSchema.optional(),
});
const aavePositionSchema = z.object({
  product: z.literal("Aave V3"),
  position_types: z.array(z.string()),
  market_address: z.string().optional(),
  asset: assetSchema.optional(),
  supplied: numberLikeSchema.optional(),
  supplied_usd: numberLikeSchema.optional(),
  borrowed: numberLikeSchema.optional(),
  borrowed_usd: numberLikeSchema.optional(),
  collateral_enabled: z.boolean().optional(),
  supply_apy: numberLikeSchema.optional(),
  borrow_apy: numberLikeSchema.optional(),
});
const midnightPositionSchema = z.object({
  product: z.literal("Midnight"),
  position_types: z.array(z.string()),
  market_id: z.string().optional(),
  type: z.string().optional(),
  maturity: z.string().optional(),
  loan_token: z.string().optional(),
  credit: numberLikeSchema.optional(),
  debt: numberLikeSchema.optional(),
  collateral_count: z.number().int().optional(),
  pending_fee: numberLikeSchema.optional(),
  effective_rate_wad: numberLikeSchema.optional(),
});

export const lendingPositionsOutputSchema = {
  wallet_address: z.string(),
  network: z.literal("base"),
  protocol: z.enum(LENDING_ACCOUNT_PROTOCOLS),
  position_type: z.enum(LENDING_POSITION_TYPES),
  positions_per_product: z.number().int(),
  detail_level: z.enum(LENDING_DETAIL_LEVELS),
  partial: z.boolean(),
  protocol_summaries: z.record(z.string(), summarySchema),
  available_counts: z.object({
    blue: z.number().int(),
    midnight: z.number().int(),
    aave_v3: z.number().int(),
  }),
  returned_counts: z.object({
    blue: z.number().int(),
    midnight: z.number().int(),
    aave_v3: z.number().int(),
  }),
  truncated: z.boolean(),
  blue_positions: z.array(bluePositionSchema),
  midnight_positions: z.array(midnightPositionSchema),
  aave_positions: z.array(aavePositionSchema),
  as_of: z.string().nullable(),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export type LendingAsset = z.infer<typeof assetSchema>;
export type LendingCollateral = z.infer<typeof collateralSchema>;
export type VariableMarket = z.infer<typeof variableMarketSchema>;
export type LendingVault = z.infer<typeof vaultSchema>;
export type FixedRateMarket = z.infer<typeof fixedMarketSchema>;
export type BluePosition = z.infer<typeof bluePositionSchema>;
export type MidnightPosition = z.infer<typeof midnightPositionSchema>;
export type AavePosition = z.infer<typeof aavePositionSchema>;
export type VariableMarketSearchInput = z.infer<
  z.ZodObject<typeof variableMarketSearchInputSchema>
>;
export type LendingVaultSearchInput = z.infer<z.ZodObject<typeof lendingVaultSearchInputSchema>>;
export type FixedMarketSearchInput = z.infer<z.ZodObject<typeof fixedMarketSearchInputSchema>>;
export type LendingProductDetailInput = z.infer<
  z.ZodObject<typeof lendingProductDetailInputSchema>
>;
export type LendingPositionsInput = z.infer<z.ZodObject<typeof lendingPositionsInputSchema>>;
export type VariableMarketSearchOutput = z.infer<
  z.ZodObject<typeof variableMarketSearchOutputSchema>
>;
export type LendingVaultSearchOutput = z.infer<z.ZodObject<typeof lendingVaultSearchOutputSchema>>;
export type FixedMarketSearchOutput = z.infer<z.ZodObject<typeof fixedMarketSearchOutputSchema>>;
export type LendingProductDetailOutput = z.infer<
  z.ZodObject<typeof lendingProductDetailOutputSchema>
>;
export type LendingPositionsOutput = z.infer<z.ZodObject<typeof lendingPositionsOutputSchema>>;
