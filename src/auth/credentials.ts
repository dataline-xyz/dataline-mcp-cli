import type { AuthMode } from "../config/runtime.js";
import { AccessAdapterError } from "./error.js";
import { OAuthTokenManager } from "./oauth/token-manager.js";
import type { OAuthTokenClient } from "./oauth/token-client.js";
import type { SecretStore } from "./secret-store.js";

export const API_KEY_HEADER = "X-Dataline-Key";

export interface CredentialProvider {
  getHeaders(): Promise<Readonly<Record<string, string>>>;
  recoverFromUnauthorized?(rejectedHeaders: Readonly<Record<string, string>>): Promise<boolean>;
}

export type CredentialSource = "environment" | "profile" | "none";

export interface CredentialStatus {
  authenticated: boolean;
  source: CredentialSource;
  expiresAt?: number;
}

export class CredentialUnavailableError extends AccessAdapterError {
  constructor(code: string, message: string) {
    super(code, message, false);
    this.name = "CredentialUnavailableError";
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
  oauthTokenClient?: OAuthTokenClient;
  now?: () => number;
  oauthExpirySkewMs?: number;
}): CredentialProvider {
  const env = options.env ?? process.env;
  if (options.authMode === "oauth") {
    const tokenManager = new OAuthTokenManager({
      profileName: options.profileName,
      secretStore: options.secretStore,
      ...(options.oauthTokenClient ? { tokenClient: options.oauthTokenClient } : {}),
      ...(options.now ? { now: options.now } : {}),
      ...(options.oauthExpirySkewMs === undefined
        ? {}
        : { expirySkewMs: options.oauthExpirySkewMs }),
    });
    return {
      getHeaders: async () => {
        const environmentHeaders = optionalEnvironmentHeaders(options.authMode, env);
        if (environmentHeaders) {
          return environmentHeaders;
        }
        return { Authorization: `Bearer ${await tokenManager.getAccessToken()}` };
      },
      recoverFromUnauthorized: async (rejectedHeaders) => {
        if (optionalEnvironmentHeaders(options.authMode, env)) {
          return false;
        }
        const rejectedAccessToken = bearerToken(rejectedHeaders.Authorization);
        return rejectedAccessToken
          ? tokenManager.recoverFromUnauthorized(rejectedAccessToken)
          : false;
      },
    };
  }

  return {
    getHeaders: async () => {
      const environmentHeaders = optionalEnvironmentHeaders(options.authMode, env);
      if (environmentHeaders) {
        return environmentHeaders;
      }

      const secrets = await options.secretStore.get(options.profileName);
      switch (options.authMode) {
        case "api_key":
          if (!secrets.apiKey) {
            throw unavailable(options.authMode);
          }
          return { [API_KEY_HEADER]: secrets.apiKey };
        case "x402":
          throw unavailable(options.authMode);
        case "oauth":
          throw new Error("OAuth credentials must use the token manager.");
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

function bearerToken(value: string | undefined): string | undefined {
  const match = /^Bearer\s+(.+)$/i.exec(value?.trim() ?? "");
  return normalizedSecret(match?.[1]);
}
