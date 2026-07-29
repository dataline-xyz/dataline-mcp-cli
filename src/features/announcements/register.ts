import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { runTool } from "../../mcp/tool-result.js";
import {
  announcementDetailInputSchema,
  announcementDetailOutputSchema,
  announcementSearchInputSchema,
  announcementSearchOutputSchema,
} from "./schema.js";
import type { AnnouncementsService } from "./service.js";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function registerAnnouncementTools(server: McpServer, service: AnnouncementsService): void {
  server.registerTool(
    "find_exchange_announcements",
    {
      title: "Find exchange announcements",
      description:
        "Search centralized-exchange announcements by source, category, keyword, or time. Use get_exchange_announcement for full content.",
      inputSchema: announcementSearchInputSchema,
      outputSchema: announcementSearchOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.search(input)),
  );

  server.registerTool(
    "get_exchange_announcement",
    {
      title: "Get exchange announcement",
      description:
        "Get one full exchange announcement by announcement_id returned by find_exchange_announcements.",
      inputSchema: announcementDetailInputSchema,
      outputSchema: announcementDetailOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.get(input)),
  );
}
