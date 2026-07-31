import { Command } from "commander";
import type { Readable } from "node:stream";

import { createProfileCredentialProvider, inspectCredential } from "../auth/credentials.js";
import { FileSecretStore, type SecretStore } from "../auth/secret-store.js";
import { loadX402PolicyConfig } from "../auth/x402/config.js";
import { resolveDatalinePaths } from "../config/paths.js";
import {
  FileProfileStore,
  type ProfileSettings,
  type ProfileStore,
} from "../config/profile-store.js";
import { resolveRuntimeContext } from "../config/resolve.js";
import { parseAuthMode, parseDataApiUrl, parseRequestTimeoutMs } from "../config/runtime.js";
import { serveStdio } from "../mcp/stdio.js";
import { VERSION } from "../version.js";
import { readSecretFromStdin } from "./stdin.js";

export interface CliDependencies {
  env?: NodeJS.ProcessEnv;
  stdin?: Readable;
  stdout: Pick<NodeJS.WriteStream, "write">;
  profileStore?: ProfileStore;
  secretStore?: SecretStore;
}

export function createCli(dependencies: CliDependencies = { stdout: process.stdout }): Command {
  const env = dependencies.env ?? process.env;
  const paths = resolveDatalinePaths(env);
  const profileStore = dependencies.profileStore ?? new FileProfileStore(paths.profilesFile);
  const secretStore = dependencies.secretStore ?? new FileSecretStore(paths.credentialsFile);
  const stdin = dependencies.stdin ?? process.stdin;
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
      const context = await resolveRuntimeContext(env, { profileStore, secretStore });
      const credentialProvider = createProfileCredentialProvider({
        authMode: context.config.authMode,
        env,
        profileName: context.profileName,
        secretStore,
      });
      await serveStdio(context.config, env, credentialProvider);
    });

  program
    .command("config")
    .description("Inspect effective non-secret configuration.")
    .command("show", { isDefault: true })
    .description("Print the effective non-secret configuration as JSON.")
    .action(async () => {
      const context = await resolveRuntimeContext(env, { profileStore, secretStore });
      writeJson(dependencies.stdout, {
        profile: context.profileName,
        authMode: context.config.authMode,
        dataApiUrl: context.config.dataApiUrl.toString(),
        requestTimeoutMs: context.config.requestTimeoutMs,
        ...(context.config.authMode === "x402" ? { x402: loadX402PolicyConfig(env) } : {}),
      });
    });

  const profile = program.command("profile").description("Manage named Dataline profiles.");
  profile
    .command("list")
    .description("List profiles as JSON.")
    .action(async () => {
      const profiles = await profileStore.list();
      writeJson(dependencies.stdout, { profiles });
    });
  profile
    .command("use")
    .argument("<name>", "Profile name")
    .description("Select the active profile.")
    .action(async (name: string) => {
      await profileStore.use(name);
      writeJson(dependencies.stdout, { activeProfile: name });
    });
  profile
    .command("set")
    .argument("<name>", "Profile name")
    .option("--auth-mode <mode>", "oauth, api_key, or x402")
    .option("--data-api-url <url>", "Data API origin")
    .option("--request-timeout-ms <milliseconds>", "Upstream timeout")
    .description("Create or update a profile.")
    .action(async (name: string, options: ProfileSetOptions) => {
      const current = (await profileStore.get(name)) ?? {};
      const settings = profileSettingsFromOptions(current, options);
      await profileStore.set(name, settings);
      writeJson(dependencies.stdout, { profile: name, settings });
    });

  const auth = program.command("auth").description("Manage credentials for a profile.");
  auth
    .command("status")
    .option("--profile <name>", "Profile to inspect")
    .description("Show non-secret authentication status.")
    .action(async (options: ProfileOption) => {
      const context = await contextForProfile(env, options.profile, profileStore, secretStore);
      const status = await inspectCredential({
        authMode: context.config.authMode,
        env,
        profileName: context.profileName,
        secretStore,
      });
      writeJson(dependencies.stdout, {
        profile: context.profileName,
        authMode: context.config.authMode,
        ...status,
      });
    });
  auth
    .command("set-api-key")
    .requiredOption("--stdin", "Read the API key from stdin")
    .option("--profile <name>", "Profile to update")
    .description("Store an API key without exposing it in process arguments.")
    .action(async (options: ProfileOption & { stdin: boolean }) => {
      const context = await contextForProfile(env, options.profile, profileStore, secretStore);
      const apiKey = await readSecretFromStdin(stdin);
      await secretStore.setApiKey(context.profileName, apiKey);
      writeJson(dependencies.stdout, {
        profile: context.profileName,
        stored: true,
      });
    });
  auth
    .command("logout")
    .option("--profile <name>", "Profile to clear")
    .description("Remove stored credentials for a profile.")
    .action(async (options: ProfileOption) => {
      const context = await contextForProfile(env, options.profile, profileStore, secretStore);
      await secretStore.clear(context.profileName);
      writeJson(dependencies.stdout, {
        profile: context.profileName,
        cleared: true,
      });
    });

  return program;
}

interface ProfileOption {
  profile?: string;
}

interface ProfileSetOptions {
  authMode?: string;
  dataApiUrl?: string;
  requestTimeoutMs?: string;
}

function profileSettingsFromOptions(
  current: ProfileSettings,
  options: ProfileSetOptions,
): ProfileSettings {
  if (!options.authMode && !options.dataApiUrl && !options.requestTimeoutMs) {
    throw new Error("Provide at least one profile setting.");
  }

  return {
    ...current,
    ...(options.authMode ? { authMode: parseAuthMode(options.authMode) } : {}),
    ...(options.dataApiUrl ? { dataApiUrl: parseDataApiUrl(options.dataApiUrl).toString() } : {}),
    ...(options.requestTimeoutMs
      ? { requestTimeoutMs: parseRequestTimeoutMs(options.requestTimeoutMs) }
      : {}),
  };
}

function contextForProfile(
  env: NodeJS.ProcessEnv,
  profile: string | undefined,
  profileStore: ProfileStore,
  secretStore: SecretStore,
) {
  return resolveRuntimeContext(profile ? { ...env, DATALINE_PROFILE: profile } : env, {
    profileStore,
    secretStore,
  });
}

function writeJson(output: Pick<NodeJS.WriteStream, "write">, value: unknown): void {
  output.write(`${JSON.stringify(value, null, 2)}\n`);
}
