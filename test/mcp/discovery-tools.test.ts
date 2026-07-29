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

describe("project and announcement MCP tools", () => {
  it("discovers four read-only search and detail tools", async () => {
    const client = await connectedClient(fakeDataApiClient());
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "search_crypto_projects",
        "get_crypto_project",
        "find_exchange_announcements",
        "get_exchange_announcement",
      ]),
    );
    for (const name of [
      "search_crypto_projects",
      "get_crypto_project",
      "find_exchange_announcements",
      "get_exchange_announcement",
    ]) {
      expect(tools.tools.find((tool) => tool.name === name)?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      });
    }
  });

  it("returns an actionable MCP error for an empty project search", async () => {
    const client = await connectedClient(fakeDataApiClient());
    const result = await client.callTool({
      name: "search_crypto_projects",
      arguments: {},
    });
    const content = result.content as Array<{ type: string; text?: string }>;

    expect(result.isError).toBe(true);
    expect(JSON.parse(content[0]?.text ?? "{}")).toMatchObject({
      error: {
        code: "project_search_needs_identity",
        retryable: false,
        agent_action_hint: "fix_arguments",
      },
    });
  });

  it("returns structured project and announcement search results", async () => {
    const client = await connectedClient(
      fakeDataApiClient({
        "/v1/crypto/project/search": {
          data: [{ project_id: "bitcoin", asset: "BTC", name: "Bitcoin" }],
          warnings: [],
        },
        "/cex/announcements/list": {
          data: {
            page: 1,
            limit: 10,
            count: 1,
            has_more: false,
            items: [{ id: 42, source: "binance", title: "New listing" }],
          },
          warnings: [],
        },
      }),
    );

    const projects = await client.callTool({
      name: "search_crypto_projects",
      arguments: { symbol: "BTC" },
    });
    const announcements = await client.callTool({
      name: "find_exchange_announcements",
      arguments: { source: "binance" },
    });

    expect(projects.isError).not.toBe(true);
    expect(projects.structuredContent).toMatchObject({
      query: "BTC",
      projects: [{ project_id: "bitcoin", asset: "BTC" }],
    });
    expect(announcements.isError).not.toBe(true);
    expect(announcements.structuredContent).toMatchObject({
      source: "binance",
      announcements: [{ announcement_id: 42, title: "New listing" }],
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
  const client = new Client({ name: "discovery-tools-test", version: "0.0.0" });
  closeCallbacks.push(async () => client.close());
  closeCallbacks.push(async () => server.close());
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function fakeDataApiClient(
  responses: Readonly<Record<string, Omit<DataApiResult<unknown>, "requestId">>> = {},
): DataApiClient {
  return {
    get: <T>(path: string): Promise<DataApiResult<T>> => {
      const response = responses[path];
      return response
        ? Promise.resolve(response as DataApiResult<T>)
        : Promise.reject(new Error(`Unexpected path: ${path}`));
    },
    post: <T>(): Promise<DataApiResult<T>> => Promise.reject(new Error("Unexpected POST")),
  };
}
