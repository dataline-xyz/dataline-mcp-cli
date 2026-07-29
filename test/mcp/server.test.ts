import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "../../src/config/runtime.js";
import { createDatalineMcpServer } from "../../src/mcp/server.js";

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map(async (close) => close()));
});

describe("MCP server", () => {
  it("negotiates a protocol session and answers ping", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createDatalineMcpServer({
      config: loadRuntimeConfig({}),
      version: "0.0.0-test",
    });
    const client = new Client({ name: "dataline-test", version: "0.0.0" });

    closeCallbacks.push(async () => client.close());
    closeCallbacks.push(async () => server.close());

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    await expect(client.ping()).resolves.toEqual({});
    expect(client.getServerVersion()).toMatchObject({
      name: "dataline",
      version: "0.0.0-test",
    });
  });
});
