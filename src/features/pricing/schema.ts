import { z } from "zod";

import { errorSchema, warningSchema } from "../shared/issues.js";
import { DATALINE_TOOL_NAMES } from "./catalog.js";

export const toolPricingInputSchema = {
  tool_names: z
    .array(z.enum(DATALINE_TOOL_NAMES))
    .max(DATALINE_TOOL_NAMES.length)
    .default([])
    .describe("MCP tool names to price; empty returns every Dataline tool."),
};

const routePriceSchema = z.object({
  route_id: z.string(),
  when: z.string().optional(),
  credits: z.number().int().nonnegative().nullable(),
  x402_usd: z.string().nullable(),
});

const toolPriceSchema = z.object({
  tool_name: z.enum(DATALINE_TOOL_NAMES),
  billing: z.enum(["free", "metered"]),
  note: z.string().optional(),
  routes: z.array(routePriceSchema),
});

export const toolPricingOutputSchema = {
  as_of: z.string(),
  cache_ttl_seconds: z.number().int().positive(),
  tools: z.array(toolPriceSchema),
  warnings: z.array(warningSchema),
  errors: z.array(errorSchema),
};

export type ToolPricingInput = z.infer<z.ZodObject<typeof toolPricingInputSchema>>;
export type ToolPricingOutput = z.infer<z.ZodObject<typeof toolPricingOutputSchema>>;
