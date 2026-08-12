import { z } from "zod";

import { DataApiError } from "../../data-api/error.js";
import { warning, type ToolWarning } from "../shared/issues.js";
import {
  TOOL_PRICING_DEFINITIONS,
  type DatalineToolName,
  type ToolPricingDefinition,
} from "./catalog.js";
import type { ToolPricingOutput } from "./schema.js";

export const DEFAULT_CONTROL_API_URL = "https://control-api.dataline.xyz";
export const DEFAULT_PRICING_CACHE_TTL_MS = 5 * 60 * 1000;

const priceSchema = z.object({
  route_id: z.string().min(1),
  name: z.string().min(1),
  method: z.string().min(1),
  path_pattern: z.string().min(1),
  cost: z.number().int().nonnegative(),
  cost_usd: z.union([z.string(), z.number()]).transform(String),
});

const responseSchema = z.object({
  code: z.string(),
  data: z.object({ prices: z.array(priceSchema) }),
});

type CatalogPrice = z.infer<typeof priceSchema>;

interface CachedPrices {
  expiresAt: number;
  fetchedAt: string;
  prices: Map<string, CatalogPrice>;
}

export interface ToolPricingReader {
  getToolPricing(toolNames?: readonly DatalineToolName[]): Promise<ToolPricingOutput>;
}

export interface PricingServiceOptions {
  controlApiUrl: URL;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
}

export class PricingService implements ToolPricingReader {
  readonly #controlApiUrl: URL;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;
  readonly #cacheTtlMs: number;
  readonly #now: () => number;
  #cache?: CachedPrices;

  constructor(options: PricingServiceOptions) {
    this.#controlApiUrl = normalizedOrigin(options.controlApiUrl);
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#cacheTtlMs = options.cacheTtlMs ?? DEFAULT_PRICING_CACHE_TTL_MS;
    this.#now = options.now ?? Date.now;
  }

  async getToolPricing(toolNames: readonly DatalineToolName[] = []): Promise<ToolPricingOutput> {
    const catalog = await this.#getCatalog();
    const selected = selectDefinitions(toolNames);
    const warnings: ToolWarning[] = [];

    const tools = selected.map((definition) => ({
      tool_name: definition.toolName,
      billing: definition.billing,
      ...(definition.note ? { note: definition.note } : {}),
      routes: definition.routes.map((binding) => {
        const price = catalog.prices.get(binding.routeId);
        if (!price) {
          warnings.push(
            warning("pricing_route_missing", "A configured tool route is missing from pricing.", {
              tool_name: definition.toolName,
              route_id: binding.routeId,
            }),
          );
        }
        return {
          route_id: binding.routeId,
          ...(binding.when ? { when: binding.when } : {}),
          credits: price?.cost ?? null,
          x402_usd: price?.cost_usd ?? null,
        };
      }),
    }));

    return {
      as_of: catalog.fetchedAt,
      cache_ttl_seconds: Math.round(this.#cacheTtlMs / 1000),
      tools,
      warnings,
      errors: [],
    };
  }

  async #getCatalog(): Promise<CachedPrices> {
    const now = this.#now();
    if (this.#cache && this.#cache.expiresAt > now) {
      return this.#cache;
    }

    const url = new URL("/v1/credit-prices", this.#controlApiUrl);
    let response: Response;
    try {
      response = await this.#fetch(url, {
        headers: { Accept: "application/json", "X-Dataline-Client": "local-mcp" },
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      throw pricingError("Dataline pricing could not be reached.", undefined, error);
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw pricingError("Dataline pricing is temporarily unavailable.", response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw pricingError("Dataline pricing returned invalid JSON.", response.status, error);
    }

    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.code !== "ok") {
      throw pricingError("Dataline pricing returned an invalid catalog.", response.status);
    }

    const fetchedAt = new Date(now).toISOString();
    this.#cache = {
      expiresAt: now + this.#cacheTtlMs,
      fetchedAt,
      prices: new Map(parsed.data.data.prices.map((price) => [price.route_id, price])),
    };
    return this.#cache;
  }
}

export function resolveControlApiUrl(dataApiUrl: URL, env: NodeJS.ProcessEnv = process.env): URL {
  const configured = env.DATALINE_CONTROL_API_URL?.trim();
  if (configured) {
    return parseControlApiUrl(configured);
  }

  const inferred = new URL(dataApiUrl);
  if (inferred.hostname === "data-api.dataline.xyz" || inferred.hostname.startsWith("data-api.")) {
    inferred.hostname = inferred.hostname.replace(/^data-api/, "control-api");
    inferred.pathname = "";
    inferred.search = "";
    inferred.hash = "";
    return inferred;
  }

  return new URL(DEFAULT_CONTROL_API_URL);
}

export function parseControlApiUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid DATALINE_CONTROL_API_URL: ${JSON.stringify(value)}.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("DATALINE_CONTROL_API_URL must use http or https.");
  }
  return normalizedOrigin(url);
}

function selectDefinitions(
  toolNames: readonly DatalineToolName[],
): readonly ToolPricingDefinition[] {
  if (toolNames.length === 0) {
    return TOOL_PRICING_DEFINITIONS;
  }
  const selected = new Set(toolNames);
  return TOOL_PRICING_DEFINITIONS.filter((definition) => selected.has(definition.toolName));
}

function normalizedOrigin(value: URL): URL {
  const url = new URL(value);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url;
}

function pricingError(message: string, status?: number, cause?: unknown): DataApiError {
  return new DataApiError({
    code: "pricing_catalog_unavailable",
    message,
    retryable: true,
    ...(status === undefined ? {} : { status }),
    ...(cause === undefined ? {} : { cause }),
  });
}
