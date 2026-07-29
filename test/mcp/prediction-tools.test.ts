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

describe("prediction MCP tools", () => {
  it("discovers two read-only prediction tools with explicit schemas", async () => {
    const client = await connectedClient(fakeDataApiClient());
    const tools = await client.listTools();
    const predictionTools = tools.tools.filter((tool) =>
      ["find_prediction_events", "get_prediction_event"].includes(tool.name),
    );

    expect(predictionTools.map((tool) => tool.name)).toEqual([
      "find_prediction_events",
      "get_prediction_event",
    ]);
    expect(predictionTools[1]).toMatchObject({
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    });
  });

  it("returns a structured prediction detail through MCP", async () => {
    const client = await connectedClient(
      fakeDataApiClient({
        event_id: 30615,
        slug: "world-cup-winner",
        title: "World Cup Winner",
        is_active: true,
        markets: { polymarket: [{ id: 1, title: "France", best_yes_ask: "0.19" }] },
      }),
    );

    const result = await client.callTool({
      name: "get_prediction_event",
      arguments: { slug: "world-cup-winner" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      event: { event_id: 30615, slug: "world-cup-winner" },
      markets_total: 1,
      markets: [{ market_id: "1", title: "France" }],
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
  const client = new Client({ name: "prediction-tools-test", version: "0.0.0" });
  closeCallbacks.push(async () => client.close());
  closeCallbacks.push(async () => server.close());
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function fakeDataApiClient(detail: Record<string, unknown> = {}): DataApiClient {
  return {
    get: <T>(path: string): Promise<DataApiResult<T>> => {
      if (path === "/prediction/events/detail") {
        return Promise.resolve({ data: detail as T, warnings: [] });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    },
    post: <T>(): Promise<DataApiResult<T>> => Promise.reject(new Error("Unexpected POST")),
  };
}
