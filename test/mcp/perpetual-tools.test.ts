import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "../../src/config/runtime.js";
import type { DataApiClient, DataApiResult } from "../../src/data-api/types.js";
import { createDatalineMcpServer } from "../../src/mcp/server.js";

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map(async (close) => close()));
});

describe("perpetual MCP tools", () => {
  it("discovers the snapshot and combined history tools", async () => {
    const client = await connectedClient(fakeDataApiClient());
    const tools = await client.listTools();

    expect(
      tools.tools.map((tool) => tool.name).filter((name) => name.startsWith("get_perpetual_")),
    ).toEqual(["get_perpetual_metrics", "get_perpetual_metrics_history"]);

    const history = tools.tools.find((tool) => tool.name === "get_perpetual_metrics_history");
    expect(history?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(history?.inputSchema).toMatchObject({ type: "object" });
    expect(history?.outputSchema).toMatchObject({ type: "object" });
  });

  it("returns structured history data through the MCP protocol", async () => {
    const client = await connectedClient(
      fakeDataApiClient({
        series: [
          {
            funding_interval_hours: "8",
            source: { provider: "binance", source_time: "2026-07-27T00:00:00Z" },
            points: [{ timestamp: "2026-07-27T00:00:00Z", funding_rate: "0.0001" }],
          },
        ],
      }),
    );

    const result = await client.callTool({
      name: "get_perpetual_metrics_history",
      arguments: { metric: "funding_rate", base: "BTC", venue: "binance" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      metric: "funding_rate",
      base: "BTC",
      quote: "USDT",
      venue: "binance",
      funding_interval_hours: "8",
      errors: [],
    });
  });

  it("returns an actionable MCP error for an unsupported combination", async () => {
    const client = await connectedClient(fakeDataApiClient());
    const result = await client.callTool({
      name: "get_perpetual_metrics_history",
      arguments: {
        metric: "open_interest",
        base: "BTC",
        venue: "hyperliquid",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(JSON.parse(content[0]?.type === "text" ? (content[0].text ?? "{}") : "{}")).toEqual({
      error: {
        code: "feature_not_implemented",
        message: "Hyperliquid open-interest history is not available. Use binance, bybit, or okx.",
        retryable: false,
        agent_action_hint: "choose_supported_venue",
      },
    });
  });
});

async function connectedClient(dataApiClient: DataApiClient): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createDatalineMcpServer({
    config: loadRuntimeConfig({}),
    dataApiClient,
    version: "0.0.0-test",
  });
  const client = new Client({ name: "perpetual-tools-test", version: "0.0.0" });
  closeCallbacks.push(async () => client.close());
  closeCallbacks.push(async () => server.close());
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function fakeDataApiClient(historyData: Record<string, unknown> = {}): DataApiClient {
  return {
    get: <T>(path: string): Promise<DataApiResult<T>> => {
      if (path === "/v1/crypto/perpetuals/funding-history") {
        return Promise.resolve({ data: historyData as T, warnings: [] });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    },
    post: <T>(): Promise<DataApiResult<T>> => Promise.reject(new Error("Unexpected POST")),
  };
}
