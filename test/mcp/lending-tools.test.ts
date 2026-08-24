import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "../../src/config/runtime.js";
import type { DataApiClient, DataApiResult } from "../../src/data-api/types.js";
import { createDatalineMcpServer } from "../../src/mcp/server.js";

const MARKET_ID = `0x${"1".repeat(64)}`;
const LENDING_TOOL_NAMES = [
  "find_variable_rate_lending_markets",
  "find_lending_vaults",
  "find_fixed_rate_lending_markets",
  "get_lending_product_detail",
  "get_lending_positions",
  "get_lending_history",
  "get_fixed_rate_lending_orderbook",
];
const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map(async (close) => close()));
});

describe("lending MCP tools", () => {
  it("discovers seven read-only tools with explicit input and output schemas", async () => {
    const client = await connectedClient(fakeDataApiClient());
    const tools = await client.listTools();
    const lendingTools = tools.tools.filter((tool) => LENDING_TOOL_NAMES.includes(tool.name));

    expect(lendingTools.map((tool) => tool.name)).toEqual(LENDING_TOOL_NAMES);
    for (const tool of lendingTools) {
      expect(tool).toMatchObject({
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
      });
    }

    const variableTool = lendingTools[0];
    if (!variableTool) {
      throw new Error("Variable-rate lending tool was not discovered.");
    }
    expect(variableTool.inputSchema.properties?.limit).toMatchObject({ default: 5, maximum: 100 });
    expect(variableTool.inputSchema.properties?.detail_level).toMatchObject({
      default: "summary",
      enum: ["summary", "detailed"],
    });
    const vaultTool = lendingTools[1];
    expect(vaultTool?.inputSchema.properties?.version).toMatchObject({
      default: "V2",
      enum: ["V2", "V1"],
    });
  });

  it("applies defaults and returns compact structured market results", async () => {
    const client = await connectedClient(
      fakeDataApiClient({
        items: [
          {
            market_id: MARKET_ID,
            loan_asset: { symbol: "USDC" },
            total_supplied_usd: "1000000",
            lltv: "0.86",
          },
        ],
        has_more: false,
      }),
    );

    const result = await client.callTool({
      name: "find_variable_rate_lending_markets",
      arguments: {},
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      detail_level: "summary",
      count: 1,
      limit: 5,
      offset: 0,
      markets: [{ market_id: MARKET_ID, total_supplied_usd: "1000000" }],
      errors: [],
    });
    expect(
      (result.structuredContent as { markets: Array<Record<string, unknown>> }).markets[0],
    ).not.toHaveProperty("lltv");
  });
});

async function connectedClient(dataApiClient: DataApiClient): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createDatalineMcpServer({
    config: loadRuntimeConfig({}),
    dataApiClient,
    version: "0.0.0-test",
  });
  const client = new Client({ name: "lending-tools-test", version: "0.0.0" });
  closeCallbacks.push(async () => client.close());
  closeCallbacks.push(async () => server.close());
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function fakeDataApiClient(data: Record<string, unknown> = {}): DataApiClient {
  return {
    get: <T>(path: string): Promise<DataApiResult<T>> => {
      if (path === "/defi/lending/variable-rate/markets") {
        return Promise.resolve({ data: data as T, warnings: [] });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    },
    post: <T>(): Promise<DataApiResult<T>> => Promise.reject(new Error("Unexpected POST")),
  };
}
