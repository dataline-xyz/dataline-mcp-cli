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

describe("crypto MCP tools", () => {
  it("discovers three read-only tools with explicit schemas", async () => {
    const client = await connectedClient(fakeDataApiClient());
    const tools = await client.listTools();

    expect(
      tools.tools.map((tool) => tool.name).filter((name) => name.startsWith("get_crypto_")),
    ).toEqual(["get_crypto_cex_price", "get_crypto_dex_price", "get_crypto_ohlcv"]);
    expect(tools.tools[0]?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(tools.tools[0]?.outputSchema).toMatchObject({ type: "object" });
  });

  it("returns structured compact data from a real MCP tool call", async () => {
    const client = await connectedClient(
      fakeDataApiClient({
        reference_price: "63000",
        reference_quote: "USDT",
        confidence: { verdict: "usable" },
        snapshots: [
          {
            market: { base: "BTC", quote: "USDT", venue: "binance" },
            source: { provider: "binance", received_time: "2026-07-27T00:00:00Z" },
            bid: "62999",
            ask: "63001",
          },
        ],
      }),
    );

    const result = await client.callTool({
      name: "get_crypto_cex_price",
      arguments: { base: "BTC" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      symbol: "BTC",
      quote: "USDT",
      price: "63000",
      confidence: "usable",
      errors: [],
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
  const client = new Client({ name: "crypto-tools-test", version: "0.0.0" });
  closeCallbacks.push(async () => client.close());
  closeCallbacks.push(async () => server.close());
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function fakeDataApiClient(priceData: Record<string, unknown> = {}): DataApiClient {
  return {
    get: <T>(path: string): Promise<DataApiResult<T>> => {
      if (path !== "/v1/crypto/cex/price") {
        return Promise.reject(new Error(`Unexpected path: ${path}`));
      }
      return Promise.resolve({ data: priceData as T, warnings: [] });
    },
    post: <T>(): Promise<DataApiResult<T>> => Promise.reject(new Error("Unexpected POST")),
  };
}
