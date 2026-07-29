import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { runTool } from "../../mcp/tool-result.js";
import {
  perpetualHistoryInputSchema,
  perpetualHistoryOutputSchema,
  perpetualMetricsInputSchema,
  perpetualMetricsOutputSchema,
} from "./schema.js";
import type { PerpetualsService } from "./service.js";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function registerPerpetualTools(server: McpServer, service: PerpetualsService): void {
  server.registerTool(
    "get_perpetual_metrics",
    {
      title: "Get perpetual metrics",
      description:
        "Get current funding, open interest, mark/index price, basis, and 24h volume for one perpetual market across venues.",
      inputSchema: perpetualMetricsInputSchema,
      outputSchema: perpetualMetricsOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.getMetrics(input)),
  );

  server.registerTool(
    "get_perpetual_metrics_history",
    {
      title: "Get perpetual metrics history",
      description:
        "Get funding-rate or open-interest history from one perpetual venue. Interval applies only to open interest; funding follows the venue schedule.",
      inputSchema: perpetualHistoryInputSchema,
      outputSchema: perpetualHistoryOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.getHistory(input)),
  );
}
