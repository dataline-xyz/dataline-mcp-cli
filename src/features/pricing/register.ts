import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { runTool } from "../../mcp/tool-result.js";
import { toolPricingInputSchema, toolPricingOutputSchema } from "./schema.js";
import type { ToolPricingReader } from "./service.js";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function registerPricingTools(server: McpServer, service: ToolPricingReader): void {
  server.registerTool(
    "get_tool_pricing",
    {
      title: "Get Dataline tool pricing",
      description:
        "Get current credit costs and x402 USD prices for Dataline MCP tools. This pricing lookup is free; filter by tool_names or leave empty for all tools.",
      inputSchema: toolPricingInputSchema,
      outputSchema: toolPricingOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.getToolPricing(input.tool_names)),
  );
}
