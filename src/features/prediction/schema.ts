import { z } from "zod";

import { errorSchema, warningSchema } from "../shared/issues.js";

export const PREDICTION_CATEGORIES = [
  "All",
  "Trending",
  "New",
  "Politics",
  "Sports",
  "Finance",
  "Crypto",
  "Geopolitics",
  "Culture",
  "World",
  "Elections",
  "Mentions",
  "Economy",
  "Tech",
  "Earnings",
] as const;
export const PREDICTION_ACTIVE_STATUSES = ["active", "inactive", "all"] as const;
export const PREDICTION_EVENT_SORTS = [
  "volume",
  "volume24hr",
  "startDate",
  "endDate",
  "createdAt",
  "updatedAt",
] as const;
export const PREDICTION_SORT_ORDERS = ["desc", "asc"] as const;
export const PREDICTION_MARKET_SORTS = [
  "yes_price",
  "volume_24h",
  "volume",
  "liquidity",
  "close_time",
] as const;

export const predictionSearchInputSchema = {
  category: z.enum(PREDICTION_CATEGORIES).default("All"),
  query: z
    .string()
    .trim()
    .max(100)
    .default("")
    .describe("Keyword over event title or slug; leave empty when browsing by category and sort."),
  active_status: z.enum(PREDICTION_ACTIVE_STATUSES).default("active"),
  sort: z.enum(PREDICTION_EVENT_SORTS).default("volume24hr"),
  order: z.enum(PREDICTION_SORT_ORDERS).default("desc"),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(25).default(5),
};

export const predictionDetailInputSchema = {
  slug: z
    .string()
    .trim()
    .max(256)
    .default("")
    .describe("Polymarket event slug from the URL; preferred over event_id."),
  event_id: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Numeric event ID returned by find_prediction_events; 0 means omitted."),
  markets_limit: z.number().int().min(1).max(100).default(8),
  markets_offset: z.number().int().min(0).default(0),
  market_sort: z.enum(PREDICTION_MARKET_SORTS).default("yes_price"),
};

const numberLikeSchema = z.union([z.number(), z.string()]);
const outcomeSchema = z.object({
  label: z.string().optional(),
  price: numberLikeSchema.optional(),
});
const eventSchema = z.object({
  provider: z.string().optional(),
  event_id: z.number().int(),
  slug: z.string().optional(),
  category: z.string().optional(),
  title: z.string(),
  status: z.string().optional(),
  volume: numberLikeSchema.optional(),
  volume_24h: numberLikeSchema.optional(),
  open_interest: numberLikeSchema.optional(),
  liquidity: numberLikeSchema.optional(),
  market_count: z.number().int().optional(),
  open_time: z.string().optional(),
  close_time: z.string().optional(),
  expiration_time: z.string().optional(),
  is_active: z.boolean(),
  url: z.string().optional(),
});
const marketSchema = z.object({
  market_id: z.string().optional(),
  slug: z.string().optional(),
  title: z.string().optional(),
  sub_title: z.string().optional(),
  status: z.string().optional(),
  is_active: z.boolean().optional(),
  trading_enabled: z.boolean().optional(),
  outcome_type: z.string().optional(),
  best_yes_bid: numberLikeSchema.optional(),
  best_yes_ask: numberLikeSchema.optional(),
  best_no_ask: numberLikeSchema.optional(),
  last_trade_price: numberLikeSchema.optional(),
  outcomes: z.array(outcomeSchema),
  volume: numberLikeSchema.optional(),
  volume_24h: numberLikeSchema.optional(),
  open_interest: numberLikeSchema.optional(),
  liquidity: numberLikeSchema.optional(),
  close_time: z.string().optional(),
  rules_summary: z.string().optional(),
  url: z.string().optional(),
});
const ruleSchema = z.object({
  rules_primary: z.string().optional(),
  rules_secondary: z.string().optional(),
});

export const predictionSearchOutputSchema = {
  category: z.enum(PREDICTION_CATEGORIES),
  active_status: z.enum(PREDICTION_ACTIVE_STATUSES),
  sort: z.enum(PREDICTION_EVENT_SORTS),
  order: z.enum(PREDICTION_SORT_ORDERS),
  page: z.number().int(),
  limit: z.number().int(),
  count: z.number().int(),
  next_page: z.number().int().nullable(),
  events: z.array(eventSchema),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export const predictionDetailOutputSchema = {
  event: eventSchema,
  markets_offset: z.number().int(),
  market_sort: z.enum(PREDICTION_MARKET_SORTS),
  markets_total: z.number().int(),
  markets_returned: z.number().int(),
  markets_next_offset: z.number().int().nullable(),
  rules: z.array(ruleSchema),
  url: z.string().optional(),
  outcomes: z.array(outcomeSchema),
  markets: z.array(marketSchema),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export type PredictionSearchInput = z.infer<z.ZodObject<typeof predictionSearchInputSchema>>;
export type PredictionDetailInput = z.infer<z.ZodObject<typeof predictionDetailInputSchema>>;
export type PredictionSearchOutput = z.infer<z.ZodObject<typeof predictionSearchOutputSchema>>;
export type PredictionDetailOutput = z.infer<z.ZodObject<typeof predictionDetailOutputSchema>>;
