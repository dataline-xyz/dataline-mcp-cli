import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { runTool } from "../../mcp/tool-result.js";
import {
  defiPoolListInputSchema,
  defiPoolListOutputSchema,
  defiPoolSearchInputSchema,
  defiPoolSearchOutputSchema,
} from "./schema.js";
import type { DefiPoolsService } from "./service.js";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function registerDefiPoolTools(server: McpServer, service: DefiPoolsService): void {
  server.registerTool(
    "list_defi_pools",
    {
      title: "List DeFi pools",
      description:
        "Browse and rank Base-chain DeFi pools by reserve, FDV, token price, or creation time. Returns 5 pools by default; set limit=20 for the full provider page.",
      inputSchema: defiPoolListInputSchema,
      outputSchema: defiPoolListOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.list(input)),
  );

  server.registerTool(
    "search_defi_pools",
    {
      title: "Search DeFi pools",
      description:
        "Find DeFi pools by pool address, token contract, symbol, or token name. Searches Base and returns 5 pools by default; use network=all for other chains or limit=20 for the full page.",
      inputSchema: defiPoolSearchInputSchema,
      outputSchema: defiPoolSearchOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.search(input)),
  );
}
