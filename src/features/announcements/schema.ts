import { z } from "zod";

import { errorSchema, warningSchema } from "../shared/issues.js";

export const ANNOUNCEMENT_SOURCES = [
  "All",
  "binance",
  "bithumb",
  "bybit",
  "coinbase",
  "hyperliquid",
  "okx",
  "upbit",
] as const;
export const ANNOUNCEMENT_CATEGORIES = [
  "All",
  "listing",
  "delisting",
  "roadmap",
  "maintenance",
  "incident",
  "futures",
  "airdrop",
  "launchpool",
  "vote",
  "deposit_withdrawal",
  "api_update",
  "earn",
  "event",
  "trading_update",
  "fiat",
  "web3",
  "product_update",
  "risk_warning",
  "disclosure",
  "general",
] as const;

export const announcementSearchInputSchema = {
  source: z.enum(ANNOUNCEMENT_SOURCES).default("All"),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).default("All"),
  query: z
    .string()
    .trim()
    .max(200)
    .default("")
    .describe("Keyword search over title, summary, and content."),
  start_time: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("Optional inclusive ISO 8601 lower time bound."),
  end_time: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("Optional inclusive ISO 8601 upper time bound."),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(10),
};

export const announcementDetailInputSchema = {
  announcement_id: z
    .number()
    .int()
    .min(1)
    .describe("Internal announcement ID returned by find_exchange_announcements."),
};

const announcementItemSchema = z.object({
  announcement_id: z.number().int(),
  source: z.string(),
  external_id: z.string().optional(),
  category: z.string().optional(),
  source_category_name: z.string().optional(),
  title: z.string(),
  summary: z.string().optional(),
  content: z.string().optional(),
  web_url: z.string().optional(),
  published_at: z.string().optional(),
  announced_at: z.string().optional(),
  status: z.number().int().optional(),
  risk_warning: z.string().optional(),
});

export const announcementSearchOutputSchema = {
  source: z.enum(ANNOUNCEMENT_SOURCES),
  category: z.enum(ANNOUNCEMENT_CATEGORIES),
  page: z.number().int(),
  limit: z.number().int(),
  count: z.number().int(),
  has_more: z.boolean(),
  announcements: z.array(announcementItemSchema),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export const announcementDetailOutputSchema = {
  announcement: announcementItemSchema,
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export type AnnouncementSearchInput = z.infer<z.ZodObject<typeof announcementSearchInputSchema>>;
export type AnnouncementDetailInput = z.infer<z.ZodObject<typeof announcementDetailInputSchema>>;
export type AnnouncementSearchOutput = z.infer<z.ZodObject<typeof announcementSearchOutputSchema>>;
export type AnnouncementDetailOutput = z.infer<z.ZodObject<typeof announcementDetailOutputSchema>>;
