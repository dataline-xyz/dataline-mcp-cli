import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  createEnvironmentCredentialProvider,
  type CredentialProvider,
} from "../auth/credentials.js";
import { createX402FetchFromEnvironment } from "../auth/x402/fetch.js";
import type { RuntimeConfig } from "../config/runtime.js";
import { FetchDataApiClient } from "../data-api/fetch-client.js";
import type { DataApiClient } from "../data-api/types.js";
import { registerAnnouncementTools } from "../features/announcements/register.js";
import { AnnouncementsService } from "../features/announcements/service.js";
import { registerCryptoTools } from "../features/crypto/register.js";
import { CryptoService } from "../features/crypto/service.js";
import { registerDefiPoolTools } from "../features/defi/register.js";
import { DefiPoolsService } from "../features/defi/service.js";
import { registerLendingTools } from "../features/lending/register.js";
import { LendingAnalyticsService } from "../features/lending/analytics-service.js";
import { LendingService } from "../features/lending/service.js";
import { registerPerpetualTools } from "../features/perpetuals/register.js";
import { PerpetualsService } from "../features/perpetuals/service.js";
import { registerPricingTools } from "../features/pricing/register.js";
import {
  PricingService,
  resolveControlApiUrl,
  type ToolPricingReader,
} from "../features/pricing/service.js";
import { registerProjectTools } from "../features/projects/register.js";
import { ProjectsService } from "../features/projects/service.js";
import { registerPredictionTools } from "../features/prediction/register.js";
import { PredictionService } from "../features/prediction/service.js";
import { VERSION } from "../version.js";

const MCP_INSTRUCTIONS = [
  "Dataline provides read-only market data.",
  "Prefer compact discovery results before detail calls.",
  "Use get_tool_pricing when the user or agent needs current credit or x402 costs.",
  "Preserve upstream warnings and errors when explaining coverage or freshness.",
].join(" ");

export interface DatalineMcpServerOptions {
  config: RuntimeConfig;
  version?: string;
  dataApiClient?: DataApiClient;
  credentialProvider?: CredentialProvider;
  pricingService?: ToolPricingReader;
  fetch?: typeof globalThis.fetch;
  controlFetch?: typeof globalThis.fetch;
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
  const env = options.env ?? process.env;
  const dataApiClient =
    options.dataApiClient ??
    new FetchDataApiClient({
      baseUrl: options.config.dataApiUrl,
      credentialProvider:
        options.credentialProvider ??
        createEnvironmentCredentialProvider(options.config.authMode, env),
      fetch:
        options.fetch ??
        (options.config.authMode === "x402"
          ? createX402FetchFromEnvironment(options.config.dataApiUrl, env)
          : globalThis.fetch),
      timeoutMs: options.config.requestTimeoutMs,
      version,
    });
  const pricingService =
    options.pricingService ??
    new PricingService({
      controlApiUrl: resolveControlApiUrl(options.config.dataApiUrl, env),
      fetch: options.controlFetch ?? globalThis.fetch,
      timeoutMs: options.config.requestTimeoutMs,
    });

  registerPricingTools(server, pricingService);
  registerCryptoTools(server, new CryptoService(dataApiClient));
  registerDefiPoolTools(server, new DefiPoolsService(dataApiClient));
  registerLendingTools(
    server,
    new LendingService(dataApiClient),
    new LendingAnalyticsService(dataApiClient),
  );
  registerPerpetualTools(server, new PerpetualsService(dataApiClient));
  registerProjectTools(server, new ProjectsService(dataApiClient));
  registerAnnouncementTools(server, new AnnouncementsService(dataApiClient));
  registerPredictionTools(server, new PredictionService(dataApiClient));

  return server;
}
