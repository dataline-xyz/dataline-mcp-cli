import { Command } from "commander";
import type { Readable } from "node:stream";

import { createProfileCredentialProvider, inspectCredential } from "../auth/credentials.js";
import {
  loadOAuthRuntimeConfig,
  parseOAuthIssuer,
  parseOAuthResource,
  parseOAuthScope,
  type OAuthRuntimeDefaults,
} from "../auth/oauth/config.js";
import { loginWithOAuth, type OAuthLoginOptions } from "../auth/oauth/login.js";
import { FetchOAuthTokenClient } from "../auth/oauth/token-client.js";
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
import { isDatalineToolName, type DatalineToolName } from "../features/pricing/catalog.js";
import {
  PricingService,
  resolveControlApiUrl,
  type ToolPricingReader,
} from "../features/pricing/service.js";
import { serveStdio } from "../mcp/stdio.js";
import { VERSION } from "../version.js";
import { readSecretFromStdin } from "./stdin.js";

export interface CliDependencies {
  env?: NodeJS.ProcessEnv;
  stdin?: Readable;
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  profileStore?: ProfileStore;
  secretStore?: SecretStore;
  pricingService?: ToolPricingReader;
  oauthLogin?: (options: OAuthLoginOptions) => ReturnType<typeof loginWithOAuth>;
}

export function createCli(dependencies: CliDependencies = { stdout: process.stdout }): Command {
  const env = dependencies.env ?? process.env;
  const paths = resolveDatalinePaths(env);
  const profileStore = dependencies.profileStore ?? new FileProfileStore(paths.profilesFile);
  const secretStore = dependencies.secretStore ?? new FileSecretStore(paths.credentialsFile);
  const stdin = dependencies.stdin ?? process.stdin;
  const stderr = dependencies.stderr ?? process.stderr;
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
      const oauthTokens =
        context.config.authMode === "oauth" && !env.DATALINE_ACCESS_TOKEN?.trim()
          ? (await secretStore.get(context.profileName)).oauth
          : undefined;
      const oauthTokenClient = oauthTokens?.client
        ? new FetchOAuthTokenClient({
            tokenEndpoint: new URL(oauthTokens.client.tokenEndpoint),
            clientId: oauthTokens.client.clientId,
            resource: oauthTokens.client.resource,
            timeoutMs: context.config.requestTimeoutMs,
          })
        : undefined;
      const credentialProvider = createProfileCredentialProvider({
        authMode: context.config.authMode,
        env,
        profileName: context.profileName,
        secretStore,
        ...(oauthTokenClient ? { oauthTokenClient } : {}),
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
        controlApiUrl: resolveControlApiUrl(context.config.dataApiUrl, env).toString(),
        requestTimeoutMs: context.config.requestTimeoutMs,
        ...(context.config.authMode === "oauth"
          ? {
              oauth: loadOAuthRuntimeConfig(
                context.config.dataApiUrl,
                env,
                oauthDefaults(context.profile),
              ),
            }
          : {}),
        ...(context.config.authMode === "x402" ? { x402: loadX402PolicyConfig(env) } : {}),
      });
    });

  program
    .command("pricing")
    .argument("[tools...]", "MCP tool names; omit to show all tools")
    .description("Show current credit costs and x402 USD prices as JSON.")
    .action(async (tools: string[]) => {
      const toolNames = parsePricingToolNames(tools);
      const context = await resolveRuntimeContext(env, { profileStore, secretStore });
      const pricingService =
        dependencies.pricingService ??
        new PricingService({
          controlApiUrl: resolveControlApiUrl(context.config.dataApiUrl, env),
          timeoutMs: context.config.requestTimeoutMs,
        });
      writeJson(dependencies.stdout, await pricingService.getToolPricing(toolNames));
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
    .option("--oauth-issuer <url>", "OAuth authorization server issuer")
    .option("--oauth-scope <scope>", "Space-delimited OAuth scopes")
    .option("--oauth-resource <url>", "OAuth resource identifier")
    .description("Create or update a profile.")
    .action(async (name: string, options: ProfileSetOptions) => {
      const current = (await profileStore.get(name)) ?? {};
      const settings = profileSettingsFromOptions(current, options);
      await profileStore.set(name, settings);
      writeJson(dependencies.stdout, { profile: name, settings });
    });

  const auth = program.command("auth").description("Manage credentials for a profile.");
  auth
    .command("login")
    .option("--profile <name>", "Profile to update")
    .option("--no-open", "Print the authorization URL without opening a browser")
    .option("--port <port>", "Loopback callback port; default 0 selects an available port")
    .option("--timeout-seconds <seconds>", "Browser callback timeout", "300")
    .description("Sign in with OAuth authorization code and PKCE.")
    .action(async (options: OAuthLoginCommandOptions) => {
      const context = await contextForProfile(env, options.profile, profileStore, secretStore);
      if (context.config.authMode !== "oauth") {
        throw new Error("OAuth login requires the selected profile to use oauth auth mode.");
      }
      const oauthConfig = loadOAuthRuntimeConfig(
        context.config.dataApiUrl,
        env,
        oauthDefaults(context.profile),
      );
      const result = await (dependencies.oauthLogin ?? loginWithOAuth)({
        profileName: context.profileName,
        secretStore,
        config: oauthConfig,
        requestTimeoutMs: context.config.requestTimeoutMs,
        callbackPort: parseCallbackPort(options.port),
        callbackTimeoutMs: parseCallbackTimeout(options.timeoutSeconds),
        launchBrowser: options.open,
        onAuthorizationUrl: (url) => {
          stderr.write(`Open this URL to authorize Dataline:\n${url.toString()}\n`);
        },
      });
      writeJson(dependencies.stdout, {
        profile: context.profileName,
        authMode: "oauth",
        authenticated: true,
        expiresAt: result.expiresAt,
        scope: result.scope,
        browserOpened: result.browserOpened,
      });
    });
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
  oauthIssuer?: string;
  oauthScope?: string;
  oauthResource?: string;
}

interface OAuthLoginCommandOptions extends ProfileOption {
  open: boolean;
  port?: string;
  timeoutSeconds: string;
}

function profileSettingsFromOptions(
  current: ProfileSettings,
  options: ProfileSetOptions,
): ProfileSettings {
  if (
    !options.authMode &&
    !options.dataApiUrl &&
    !options.requestTimeoutMs &&
    !options.oauthIssuer &&
    !options.oauthScope &&
    !options.oauthResource
  ) {
    throw new Error("Provide at least one profile setting.");
  }

  return {
    ...current,
    ...(options.authMode ? { authMode: parseAuthMode(options.authMode) } : {}),
    ...(options.dataApiUrl ? { dataApiUrl: parseDataApiUrl(options.dataApiUrl).toString() } : {}),
    ...(options.requestTimeoutMs
      ? { requestTimeoutMs: parseRequestTimeoutMs(options.requestTimeoutMs) }
      : {}),
    ...(options.oauthIssuer
      ? { oauthIssuer: parseOAuthIssuer(options.oauthIssuer).toString() }
      : {}),
    ...(options.oauthScope ? { oauthScope: parseOAuthScope(options.oauthScope) } : {}),
    ...(options.oauthResource ? { oauthResource: parseOAuthResource(options.oauthResource) } : {}),
  };
}

function oauthDefaults(profile: ProfileSettings): OAuthRuntimeDefaults {
  return {
    ...(profile.oauthIssuer ? { issuer: profile.oauthIssuer } : {}),
    ...(profile.oauthScope ? { scope: profile.oauthScope } : {}),
    ...(profile.oauthResource ? { resource: profile.oauthResource } : {}),
  };
}

function parsePricingToolNames(values: readonly string[]): DatalineToolName[] {
  const unknown = values.filter((value) => !isDatalineToolName(value));
  if (unknown.length > 0) {
    throw new Error(`Unknown Dataline MCP tool: ${unknown.join(", ")}.`);
  }
  return values as DatalineToolName[];
}

function parseCallbackPort(value: string | undefined): number {
  if (value === undefined) return 0;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("OAuth callback port must be an integer from 0 to 65535.");
  }
  return port;
}

function parseCallbackTimeout(value: string): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 900) {
    throw new Error("OAuth callback timeout must be from 1 to 900 seconds.");
  }
  return Math.floor(seconds * 1_000);
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
