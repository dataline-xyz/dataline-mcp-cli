import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { runTool } from "../../mcp/tool-result.js";
import {
  predictionDetailInputSchema,
  predictionDetailOutputSchema,
  predictionSearchInputSchema,
  predictionSearchOutputSchema,
} from "./schema.js";
import type { PredictionService } from "./service.js";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function registerPredictionTools(server: McpServer, service: PredictionService): void {
  server.registerTool(
    "find_prediction_events",
    {
      title: "Find prediction events",
      description:
        "Find or browse Polymarket events by keyword, category, activity, and sort. Use get_prediction_event for child markets and rules.",
      inputSchema: predictionSearchInputSchema,
      outputSchema: predictionSearchOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.search(input)),
  );

  server.registerTool(
    "get_prediction_event",
    {
      title: "Get prediction event",
      description:
        "Get one Polymarket event by URL slug or event_id, with locally sorted and paged child markets. A market is one question or option within the event.",
      inputSchema: predictionDetailInputSchema,
      outputSchema: predictionDetailOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.get(input)),
  );
}
