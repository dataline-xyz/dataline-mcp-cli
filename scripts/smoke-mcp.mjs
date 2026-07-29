import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/cli.js", "mcp", "serve"],
  stderr: "pipe",
});
const client = new Client({ name: "dataline-smoke", version: "0.0.0" });

try {
  await client.connect(transport);
  await client.ping();

  const server = client.getServerVersion();
  if (server?.name !== "dataline") {
    throw new Error(`Unexpected MCP server: ${JSON.stringify(server)}`);
  }

  const tools = await client.listTools();
  const expectedTools = [
    "get_crypto_cex_price",
    "get_crypto_dex_price",
    "get_crypto_ohlcv",
    "get_perpetual_metrics",
    "get_perpetual_metrics_history",
  ];
  const actualTools = tools.tools.map((tool) => tool.name);
  for (const tool of expectedTools) {
    if (!actualTools.includes(tool)) {
      throw new Error(`Missing MCP tool ${tool}: ${JSON.stringify(actualTools)}`);
    }
  }

  process.stderr.write(
    `MCP smoke passed (${server.name} ${server.version}, ${actualTools.length} tools).\n`,
  );
} finally {
  await client.close();
}
