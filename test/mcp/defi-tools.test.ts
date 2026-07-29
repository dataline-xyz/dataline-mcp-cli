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

describe("DeFi pool MCP tools", () => {
  it("discovers list and search tools with explicit schemas", async () => {
    const client = await connectedClient(fakeDataApiClient());
    const tools = await client.listTools();
    const defiTools = tools.tools.filter((tool) =>
      ["list_defi_pools", "search_defi_pools"].includes(tool.name),
    );

    expect(defiTools.map((tool) => tool.name)).toEqual(["list_defi_pools", "search_defi_pools"]);
    expect(defiTools[0]).toMatchObject({
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    });
  });

  it("returns compact structured pool search results through MCP", async () => {
    const client = await connectedClient(
      fakeDataApiClient([
        {
          pool_id: "base_pool",
          network: "base",
          name: "WETH / USDC",
          dex_id: "aerodrome-base",
          reserve_in_usd: "5000000",
        },
      ]),
    );

    const result = await client.callTool({
      name: "search_defi_pools",
      arguments: { query: "WETH", network: "base" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      query: "WETH",
      network: "base",
      pools: [{ pool_id: "base_pool", dex_id: "aerodrome-base" }],
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
  const client = new Client({ name: "defi-tools-test", version: "0.0.0" });
  closeCallbacks.push(async () => client.close());
  closeCallbacks.push(async () => server.close());
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function fakeDataApiClient(pools: Array<Record<string, unknown>> = []): DataApiClient {
  return {
    get: <T>(path: string): Promise<DataApiResult<T>> => {
      if (path === "/defi/pools/search") {
        return Promise.resolve({ data: pools as T, warnings: [] });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    },
    post: <T>(): Promise<DataApiResult<T>> => Promise.reject(new Error("Unexpected POST")),
  };
}
