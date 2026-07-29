import { Command } from "commander";

import { loadRuntimeConfig } from "../config/runtime.js";
import { serveStdio } from "../mcp/stdio.js";
import { VERSION } from "../version.js";

export interface CliDependencies {
  env?: NodeJS.ProcessEnv;
  stdout: Pick<NodeJS.WriteStream, "write">;
}

export function createCli(dependencies: CliDependencies = { stdout: process.stdout }): Command {
  const env = dependencies.env ?? process.env;
  const program = new Command()
    .name("dataline")
    .description("Dataline market-data MCP server and command-line client.")
    .version(VERSION)
    .showHelpAfterError();

  program
    .command("mcp")
    .description("Run the local MCP server.")
    .command("serve", { isDefault: true })
    .description("Serve MCP over stdio.")
    .action(async () => {
      await serveStdio(loadRuntimeConfig(env));
    });

  program
    .command("config")
    .description("Inspect effective non-secret configuration.")
    .command("show", { isDefault: true })
    .description("Print the effective non-secret configuration as JSON.")
    .action(() => {
      const config = loadRuntimeConfig(env);
      dependencies.stdout.write(
        `${JSON.stringify(
          {
            authMode: config.authMode,
            dataApiUrl: config.dataApiUrl.toString(),
          },
          null,
          2,
        )}\n`,
      );
    });

  return program;
}
