import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/config/runtime.js";
import type { ToolPricingReader } from "../../src/features/pricing/service.js";
import { createDatalineMcpServer } from "../../src/mcp/server.js";

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map(async (close) => close()));
});

describe("pricing MCP tool", () => {
  it("discovers and calls the free pricing tool", async () => {
    const getToolPricing: ToolPricingReader["getToolPricing"] = vi.fn().mockResolvedValue({
      as_of: "2026-08-12T03:00:00.000Z",
      cache_ttl_seconds: 300,
      tools: [
        {
          tool_name: "get_crypto_cex_price",
          billing: "metered",
          routes: [
            {
              route_id: "crypto.cex.price.read",
              credits: 1,
              x402_usd: "0.001000",
            },
          ],
        },
      ],
      warnings: [],
      errors: [],
    });
    const pricingService: ToolPricingReader = { getToolPricing };
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createDatalineMcpServer({
      config: loadRuntimeConfig({}),
      dataApiClient: { get: vi.fn(), post: vi.fn() },
      pricingService,
    });
    const client = new Client({ name: "pricing-test", version: "0.0.0" });
    closeCallbacks.push(async () => client.close());
    closeCallbacks.push(async () => server.close());
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    expect(tools.tools.find((tool) => tool.name === "get_tool_pricing")).toMatchObject({
      title: "Get Dataline tool pricing",
      annotations: { readOnlyHint: true, destructiveHint: false },
    });

    const result = await client.callTool({
      name: "get_tool_pricing",
      arguments: { tool_names: ["get_crypto_cex_price"] },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      tools: [
        {
          tool_name: "get_crypto_cex_price",
          routes: [{ credits: 1, x402_usd: "0.001000" }],
        },
      ],
    });
    expect(getToolPricing).toHaveBeenCalledWith(["get_crypto_cex_price"]);
  });
});
