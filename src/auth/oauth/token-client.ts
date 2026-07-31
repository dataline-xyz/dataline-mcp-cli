import { z } from "zod";

import { AccessAdapterError } from "../error.js";

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1).optional(),
    expires_in: z.union([z.number().positive(), z.string().min(1)]),
    token_type: z.string().min(1),
    scope: z.string().optional(),
  })
  .passthrough();

export interface OAuthRefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: "Bearer";
  scope?: string[];
}

export interface OAuthTokenClient {
  refresh(refreshToken: string): Promise<OAuthRefreshResult>;
}

export interface FetchOAuthTokenClientOptions {
  tokenEndpoint: URL;
  clientId: string;
  resource?: string;
  timeoutMs: number;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}

export class OAuthTokenRequestError extends AccessAdapterError {
  constructor(code: string, message: string, status?: number) {
    super(code, message, isRetryableStatus(status), status);
    this.name = "OAuthTokenRequestError";
  }
}

export class FetchOAuthTokenClient implements OAuthTokenClient {
  readonly #tokenEndpoint: URL;
  readonly #clientId: string;
  readonly #resource: string | undefined;
  readonly #timeoutMs: number;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => number;

  constructor(options: FetchOAuthTokenClientOptions) {
    this.#tokenEndpoint = new URL(options.tokenEndpoint);
    this.#clientId = requireValue(options.clientId, "OAuth client ID");
    this.#resource = options.resource
      ? requireValue(options.resource, "OAuth resource")
      : undefined;
    this.#timeoutMs = options.timeoutMs;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? Date.now;
  }

  async refresh(refreshToken: string): Promise<OAuthRefreshResult> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: requireValue(refreshToken, "OAuth refresh token"),
      client_id: this.#clientId,
    });
    if (this.#resource) {
      body.set("resource", this.#resource);
    }

    return this.#requestToken(body);
  }

  exchangeAuthorizationCode(options: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<OAuthRefreshResult> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.#clientId,
      redirect_uri: requireValue(options.redirectUri, "OAuth redirect URI"),
      code: requireValue(options.code, "OAuth authorization code"),
      code_verifier: requireValue(options.codeVerifier, "PKCE verifier"),
    });
    if (this.#resource) {
      body.set("resource", this.#resource);
    }
    return this.#requestToken(body);
  }

  async #requestToken(body: URLSearchParams): Promise<OAuthRefreshResult> {
    let response: Response;
    try {
      response = await this.#fetch(this.#tokenEndpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch {
      throw new OAuthTokenRequestError(
        "oauth_token_endpoint_unreachable",
        "The OAuth token endpoint could not be reached.",
      );
    }

    const payload = await readJson(response);
    if (!response.ok) {
      throw new OAuthTokenRequestError(
        oauthErrorCode(payload),
        "The OAuth token endpoint rejected the token request.",
        response.status,
      );
    }

    const parsed = tokenResponseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.token_type.toLowerCase() !== "bearer") {
      throw new OAuthTokenRequestError(
        "oauth_invalid_token_response",
        "The OAuth token endpoint returned an invalid token response.",
        response.status,
      );
    }

    const expiresIn = Number(parsed.data.expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new OAuthTokenRequestError(
        "oauth_invalid_token_response",
        "The OAuth token endpoint returned an invalid token lifetime.",
        response.status,
      );
    }

    return {
      accessToken: parsed.data.access_token,
      expiresAt: this.#now() + Math.floor(expiresIn * 1_000),
      tokenType: "Bearer",
      ...(parsed.data.refresh_token ? { refreshToken: parsed.data.refresh_token } : {}),
      ...(parsed.data.scope ? { scope: parsed.data.scope.split(/\s+/).filter(Boolean) } : {}),
    };
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new OAuthTokenRequestError(
      "oauth_invalid_token_response",
      "The OAuth token endpoint returned invalid JSON.",
      response.status,
    );
  }
}

function oauthErrorCode(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.trim()
  ) {
    return `oauth_${payload.error
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "_")}`;
  }
  return "oauth_refresh_rejected";
}

function requireValue(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} cannot be empty.`);
  }
  return normalized;
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || status >= 500;
}
