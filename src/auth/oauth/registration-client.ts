import { z } from "zod";

import { AccessAdapterError } from "../error.js";
import type { OAuthAuthorizationServerMetadata } from "./metadata.js";

const registrationResponseSchema = z
  .object({
    client_id: z.string().min(1),
    token_endpoint_auth_method: z.literal("none"),
    grant_types: z.array(z.string()),
    redirect_uris: z.array(z.string()),
    scope: z.string().min(1),
  })
  .passthrough();

export interface OAuthPublicClientRegistration {
  clientId: string;
  redirectUri: string;
}

export interface RegisterOAuthPublicClientOptions {
  metadata: OAuthAuthorizationServerMetadata;
  redirectUri: string;
  scope: string;
  resource: string;
  timeoutMs: number;
  fetch?: typeof globalThis.fetch;
}

export class OAuthRegistrationError extends AccessAdapterError {
  constructor(code: string, message: string, status?: number) {
    super(
      code,
      message,
      status === undefined || status === 408 || status === 429 || status >= 500,
      status,
    );
    this.name = "OAuthRegistrationError";
  }
}

export async function registerOAuthPublicClient(
  options: RegisterOAuthPublicClientOptions,
): Promise<OAuthPublicClientRegistration> {
  const unsupportedScopes = options.scope
    .split(/\s+/u)
    .filter((scope) => !options.metadata.scopesSupported.includes(scope));
  if (unsupportedScopes.length > 0) {
    throw new OAuthRegistrationError(
      "oauth_scope_unsupported",
      "The configured OAuth scope is not advertised by the authorization server.",
    );
  }
  const fetch = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetch(options.metadata.registrationEndpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Dataline MCP and CLI",
        redirect_uris: [options.redirectUri],
        scope: options.scope,
        allowed_resources: [options.resource],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch {
    throw new OAuthRegistrationError(
      "oauth_registration_unreachable",
      "The OAuth client registration endpoint could not be reached.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OAuthRegistrationError(
      "oauth_invalid_registration_response",
      "The OAuth client registration endpoint returned invalid JSON.",
      response.status,
    );
  }
  if (!response.ok) {
    throw new OAuthRegistrationError(
      "oauth_registration_rejected",
      "The OAuth authorization server rejected public client registration.",
      response.status,
    );
  }
  const parsed = registrationResponseSchema.safeParse(payload);
  if (
    !parsed.success ||
    !parsed.data.grant_types.includes("authorization_code") ||
    !parsed.data.grant_types.includes("refresh_token") ||
    !parsed.data.redirect_uris.includes(options.redirectUri)
  ) {
    throw new OAuthRegistrationError(
      "oauth_invalid_registration_response",
      "The OAuth client registration endpoint returned an incompatible client registration.",
      response.status,
    );
  }

  return { clientId: parsed.data.client_id, redirectUri: options.redirectUri };
}
