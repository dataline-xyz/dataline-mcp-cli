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

  process.stderr.write(`MCP smoke passed (${server.name} ${server.version}).\n`);
} finally {
  await client.close();
}
