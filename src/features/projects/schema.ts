import { z } from "zod";

import { errorSchema, warningSchema } from "../shared/issues.js";

const optionalSearchText = (description: string, maxLength: number) =>
  z.string().trim().max(maxLength).default("").describe(description);
const numberLikeSchema = z.union([z.number(), z.string()]);

export const projectSearchInputSchema = {
  symbol: optionalSearchText("Ticker symbol such as BTC, ETH, BNB, or SOL.", 32),
  project_name: optionalSearchText("Project name such as Bitcoin, Uniswap, or Ethena.", 128),
  query: optionalSearchText("Free-text fallback when the symbol or project name is unclear.", 128),
  contract_address: optionalSearchText(
    "Auxiliary token contract address; symbol or project_name is preferred for multi-chain projects.",
    128,
  ),
  limit: z.number().int().min(1).max(10).default(5),
  offset: z.number().int().min(0).default(0),
};

export const projectDetailInputSchema = {
  project_id: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe("Project ID returned by search_crypto_projects."),
};

const contractSchema = z.object({
  chain: z.string().optional(),
  contract_address: z.string().optional(),
});
const sourceValueSchema = z.object({
  coingecko: numberLikeSchema.optional(),
  coinmarketcap: numberLikeSchema.optional(),
});
const investorSchema = z.object({
  name: z.string().optional(),
  type: z.enum(["project", "organization", "person"]).optional(),
  logo: z.string().optional(),
  is_lead_investor: z.boolean().optional(),
});
const fundraiseSchema = z.object({
  round: z.string().optional(),
  published_time: z.string().optional(),
  amount: numberLikeSchema.optional(),
  valuation: numberLikeSchema.optional(),
  investors: z.array(investorSchema),
  one_liner: z.string().optional(),
  x_url: z.string().optional(),
});
const socialMediaSchema = z.object({
  website: z.string().optional(),
  x: z.string().optional(),
  twitter: z.string().optional(),
  telegram: z.string().optional(),
  discord: z.string().optional(),
  github: z.string().optional(),
  medium: z.string().optional(),
  linkedin: z.string().optional(),
  gitbook: z.string().optional(),
  docs: z.string().optional(),
  defillama: z.string().optional(),
});
const searchItemSchema = z.object({
  project_id: z.string().optional(),
  asset: z.string().optional(),
  name: z.string().optional(),
  one_liner: z.string().optional(),
  market_cap: numberLikeSchema.optional(),
  contracts: z.array(contractSchema).optional(),
});

export const projectSearchOutputSchema = {
  query: z.string(),
  limit: z.number().int(),
  offset: z.number().int(),
  count: z.number().int(),
  projects: z.array(searchItemSchema),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export const projectDetailOutputSchema = {
  project_id: z.string(),
  asset: z.string().optional(),
  name: z.string().optional(),
  one_liner: z.string().optional(),
  description: z.string().optional(),
  total_funding: numberLikeSchema.optional(),
  social_media: socialMediaSchema,
  market_cap_usd: sourceValueSchema,
  fully_diluted_valuation_usd: sourceValueSchema,
  circulating_supply: sourceValueSchema,
  total_supply: sourceValueSchema,
  max_supply: sourceValueSchema,
  volume_24h_usd: sourceValueSchema,
  contracts: z.array(contractSchema),
  contract_count: z.number().int(),
  exchange_presence: z.array(z.string()),
  exchange_presence_count: z.number().int(),
  investors: z.array(investorSchema),
  fundraise: z.array(fundraiseSchema),
  fundraise_count: z.number().int(),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export type ProjectSearchInput = z.infer<z.ZodObject<typeof projectSearchInputSchema>>;
export type ProjectDetailInput = z.infer<z.ZodObject<typeof projectDetailInputSchema>>;
export type ProjectSearchOutput = z.infer<z.ZodObject<typeof projectSearchOutputSchema>>;
export type ProjectDetailOutput = z.infer<z.ZodObject<typeof projectDetailOutputSchema>>;
