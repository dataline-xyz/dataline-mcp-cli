import type { AuthMode } from "../config/runtime.js";

export const API_KEY_HEADER = "X-Dataline-Key";

export interface CredentialProvider {
  getHeaders(): Promise<Readonly<Record<string, string>>>;
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

function normalizedSecret(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
