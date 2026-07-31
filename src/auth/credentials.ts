import type { AuthMode } from "../config/runtime.js";
import type { SecretStore } from "./secret-store.js";

export const API_KEY_HEADER = "X-Dataline-Key";

export interface CredentialProvider {
  getHeaders(): Promise<Readonly<Record<string, string>>>;
}

export type CredentialSource = "environment" | "profile" | "none";

export interface CredentialStatus {
  authenticated: boolean;
  source: CredentialSource;
  expiresAt?: number;
}

export class CredentialUnavailableError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CredentialUnavailableError";
    this.code = code;
  }
}

export function createEnvironmentCredentialProvider(
  authMode: AuthMode,
  env: NodeJS.ProcessEnv = process.env,
): CredentialProvider {
  return {
    getHeaders: () => Promise.resolve(credentialHeaders(authMode, env)),
  };
}

export function createProfileCredentialProvider(options: {
  authMode: AuthMode;
  env?: NodeJS.ProcessEnv;
  profileName: string;
  secretStore: SecretStore;
}): CredentialProvider {
  const env = options.env ?? process.env;
  return {
    getHeaders: async () => {
      const environmentHeaders = optionalEnvironmentHeaders(options.authMode, env);
      if (environmentHeaders) {
        return environmentHeaders;
      }

      const secrets = await options.secretStore.get(options.profileName);
      switch (options.authMode) {
        case "oauth":
          if (!secrets.oauth) {
            throw unavailable(options.authMode);
          }
          return { Authorization: `Bearer ${secrets.oauth.accessToken}` };
        case "api_key":
          if (!secrets.apiKey) {
            throw unavailable(options.authMode);
          }
          return { [API_KEY_HEADER]: secrets.apiKey };
        case "x402":
          throw unavailable(options.authMode);
      }
    },
  };
}

export async function inspectCredential(options: {
  authMode: AuthMode;
  env?: NodeJS.ProcessEnv;
  profileName: string;
  secretStore: SecretStore;
}): Promise<CredentialStatus> {
  const env = options.env ?? process.env;
  if (optionalEnvironmentHeaders(options.authMode, env)) {
    return { authenticated: true, source: "environment" };
  }

  const secrets = await options.secretStore.get(options.profileName);
  if (options.authMode === "api_key" && secrets.apiKey) {
    return { authenticated: true, source: "profile" };
  }
  if (options.authMode === "oauth" && secrets.oauth) {
    return {
      authenticated: true,
      source: "profile",
      expiresAt: secrets.oauth.expiresAt,
    };
  }
  return { authenticated: false, source: "none" };
}

export function credentialHeaders(
  authMode: AuthMode,
  env: NodeJS.ProcessEnv,
): Readonly<Record<string, string>> {
  switch (authMode) {
    case "oauth": {
      const token = normalizedSecret(env.DATALINE_ACCESS_TOKEN);
      if (!token) {
        throw new CredentialUnavailableError(
          "oauth_token_missing",
          "OAuth mode requires a Dataline access token. Run `dataline auth login` once OAuth support is available, or set DATALINE_ACCESS_TOKEN for development.",
        );
      }
      return { Authorization: `Bearer ${token}` };
    }
    case "api_key": {
      const apiKey = normalizedSecret(env.DATALINE_API_KEY);
      if (!apiKey) {
        throw new CredentialUnavailableError(
          "api_key_missing",
          "API key mode requires DATALINE_API_KEY.",
        );
      }
      return { [API_KEY_HEADER]: apiKey };
    }
    case "x402":
      throw new CredentialUnavailableError(
        "x402_not_available",
        "x402 mode is not available in this release.",
      );
  }
}

function optionalEnvironmentHeaders(
  authMode: AuthMode,
  env: NodeJS.ProcessEnv,
): Readonly<Record<string, string>> | undefined {
  if (authMode === "oauth" && normalizedSecret(env.DATALINE_ACCESS_TOKEN)) {
    return credentialHeaders(authMode, env);
  }
  if (authMode === "api_key" && normalizedSecret(env.DATALINE_API_KEY)) {
    return credentialHeaders(authMode, env);
  }
  return undefined;
}

function unavailable(authMode: AuthMode): CredentialUnavailableError {
  switch (authMode) {
    case "oauth":
      return new CredentialUnavailableError(
        "oauth_token_missing",
        "OAuth mode requires a Dataline login or DATALINE_ACCESS_TOKEN.",
      );
    case "api_key":
      return new CredentialUnavailableError(
        "api_key_missing",
        "API key mode requires a stored API key or DATALINE_API_KEY.",
      );
    case "x402":
      return new CredentialUnavailableError(
        "x402_not_available",
        "x402 mode is not available in this release.",
      );
  }
}

function normalizedSecret(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
