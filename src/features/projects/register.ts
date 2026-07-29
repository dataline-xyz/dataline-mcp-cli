import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { runTool } from "../../mcp/tool-result.js";
import {
  projectDetailInputSchema,
  projectDetailOutputSchema,
  projectSearchInputSchema,
  projectSearchOutputSchema,
} from "./schema.js";
import type { ProjectsService } from "./service.js";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function registerProjectTools(server: McpServer, service: ProjectsService): void {
  server.registerTool(
    "search_crypto_projects",
    {
      title: "Search crypto projects",
      description:
        "Resolve a crypto symbol or project name to a project_id. Results are compact; use get_crypto_project for fundamentals.",
      inputSchema: projectSearchInputSchema,
      outputSchema: projectSearchOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.search(input)),
  );

  server.registerTool(
    "get_crypto_project",
    {
      title: "Get crypto project",
      description:
        "Get fundamentals and metadata for a project_id returned by search_crypto_projects. Use price tools for live market prices.",
      inputSchema: projectDetailInputSchema,
      outputSchema: projectDetailOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.get(input)),
  );
}
