import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { RuntimeConfig } from "../config/runtime.js";
import { VERSION } from "../version.js";

const MCP_INSTRUCTIONS = [
  "Dataline provides read-only market data.",
  "Prefer compact discovery results before detail calls.",
  "Preserve upstream warnings and errors when explaining coverage or freshness.",
].join(" ");

export interface DatalineMcpServerOptions {
  config: RuntimeConfig;
  version?: string;
}

export function createDatalineMcpServer(options: DatalineMcpServerOptions): McpServer {
  const server = new McpServer(
    {
      name: "dataline",
      version: options.version ?? VERSION,
    },
    {
      instructions: MCP_INSTRUCTIONS,
    },
  );

  // Feature modules will register tools here in small, contract-tested slices.
  // Keeping config in the factory signature prevents transport and global-state coupling.
  void options.config;

  return server;
}
