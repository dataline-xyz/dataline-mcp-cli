import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import type { CredentialProvider } from "../auth/credentials.js";
import type { RuntimeConfig } from "../config/runtime.js";
import { createDatalineMcpServer } from "./server.js";

export async function serveStdio(
  config: RuntimeConfig,
  env: NodeJS.ProcessEnv = process.env,
  credentialProvider?: CredentialProvider,
): Promise<void> {
  const server = createDatalineMcpServer({
    config,
    env,
    ...(credentialProvider ? { credentialProvider } : {}),
  });
  const transport = new StdioServerTransport();
  let closing = false;

  const close = async (): Promise<void> => {
    if (closing) {
      return;
    }

    closing = true;
    await server.close();
  };

  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });

  await server.connect(transport);
}
