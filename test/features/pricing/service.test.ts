import { describe, expect, it, vi } from "vitest";

import { TOOL_PRICING_DEFINITIONS } from "../../../src/features/pricing/catalog.js";
import { PricingService, resolveControlApiUrl } from "../../../src/features/pricing/service.js";

describe("PricingService", () => {
  it("maps current route prices to tools and caches the catalog", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        code: "ok",
        data: { prices: catalogPrices() },
      }),
    );
    const service = new PricingService({
      controlApiUrl: new URL("https://control-api.dataline.xyz"),
      fetch,
      now: () => Date.parse("2026-08-12T03:00:00Z"),
    });

    const all = await service.getToolPricing();
    const selected = await service.getToolPricing(["get_perpetual_metrics_history"]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(all.tools).toHaveLength(TOOL_PRICING_DEFINITIONS.length);
    expect(all.tools[0]).toMatchObject({
      tool_name: "get_tool_pricing",
      billing: "free",
      routes: [],
    });
    expect(selected).toMatchObject({
      as_of: "2026-08-12T03:00:00.000Z",
      cache_ttl_seconds: 300,
      warnings: [],
      errors: [],
    });
    expect(selected.tools[0]?.routes).toEqual([
      expect.objectContaining({
        route_id: "crypto.perpetuals.funding_history.read",
        when: "metric=funding_rate",
        credits: 1,
        x402_usd: "0.001000",
      }),
      expect.objectContaining({
        route_id: "crypto.perpetuals.open_interest_history.read",
        when: "metric=open_interest",
        credits: 1,
        x402_usd: "0.001000",
      }),
    ]);
  });

  it("keeps missing route mappings visible with a warning", async () => {
    const service = new PricingService({
      controlApiUrl: new URL("https://control-api.dataline.xyz"),
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(Response.json({ code: "ok", data: { prices: [] } })),
    });

    const result = await service.getToolPricing(["get_crypto_cex_price"]);

    expect(result.tools[0]?.routes[0]).toMatchObject({
      route_id: "crypto.cex.price.read",
      credits: null,
      x402_usd: null,
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "pricing_route_missing", severity: "warning" }),
    ]);
  });
});

describe("resolveControlApiUrl", () => {
  it("tracks production and test Data API subdomains", () => {
    expect(resolveControlApiUrl(new URL("https://data-api.dataline.xyz"), {}).toString()).toBe(
      "https://control-api.dataline.xyz/",
    );
    expect(resolveControlApiUrl(new URL("https://data-api.t.dataline.xyz"), {}).toString()).toBe(
      "https://control-api.t.dataline.xyz/",
    );
  });

  it("prefers the explicit Control API URL", () => {
    expect(
      resolveControlApiUrl(new URL("http://127.0.0.1:8008"), {
        DATALINE_CONTROL_API_URL: "http://127.0.0.1:8020/internal/path",
      }).toString(),
    ).toBe("http://127.0.0.1:8020/");
  });
});

function catalogPrices() {
  const routeIds = new Set(
    TOOL_PRICING_DEFINITIONS.flatMap((definition) =>
      definition.routes.map((binding) => binding.routeId),
    ),
  );
  return [...routeIds].map((routeId) => ({
    route_id: routeId,
    name: routeId,
    method: "GET",
    path_pattern: `/${routeId}`,
    cost: 1,
    cost_usd: "0.001000",
  }));
}
