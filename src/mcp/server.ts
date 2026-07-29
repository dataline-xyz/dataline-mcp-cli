import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createEnvironmentCredentialProvider } from "../auth/credentials.js";
import type { RuntimeConfig } from "../config/runtime.js";
import { FetchDataApiClient } from "../data-api/fetch-client.js";
import type { DataApiClient } from "../data-api/types.js";
import { registerAnnouncementTools } from "../features/announcements/register.js";
import { AnnouncementsService } from "../features/announcements/service.js";
import { registerCryptoTools } from "../features/crypto/register.js";
import { CryptoService } from "../features/crypto/service.js";
import { registerPerpetualTools } from "../features/perpetuals/register.js";
import { PerpetualsService } from "../features/perpetuals/service.js";
import { registerProjectTools } from "../features/projects/register.js";
import { ProjectsService } from "../features/projects/service.js";
import { registerPredictionTools } from "../features/prediction/register.js";
import { PredictionService } from "../features/prediction/service.js";
import { VERSION } from "../version.js";

const MCP_INSTRUCTIONS = [
  "Dataline provides read-only market data.",
  "Prefer compact discovery results before detail calls.",
  "Preserve upstream warnings and errors when explaining coverage or freshness.",
].join(" ");

export interface DatalineMcpServerOptions {
  config: RuntimeConfig;
  version?: string;
  dataApiClient?: DataApiClient;
  env?: NodeJS.ProcessEnv;
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

  const version = options.version ?? VERSION;
  const dataApiClient =
    options.dataApiClient ??
    new FetchDataApiClient({
      baseUrl: options.config.dataApiUrl,
      credentialProvider: createEnvironmentCredentialProvider(
        options.config.authMode,
        options.env ?? process.env,
      ),
      timeoutMs: options.config.requestTimeoutMs,
      version,
    });

  registerCryptoTools(server, new CryptoService(dataApiClient));
  registerPerpetualTools(server, new PerpetualsService(dataApiClient));
  registerProjectTools(server, new ProjectsService(dataApiClient));
  registerAnnouncementTools(server, new AnnouncementsService(dataApiClient));
  registerPredictionTools(server, new PredictionService(dataApiClient));

  return server;
}
