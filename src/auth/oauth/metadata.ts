import { z } from "zod";

import { AccessAdapterError } from "../error.js";

const metadataSchema = z
  .object({
    issuer: z.string().min(1),
    authorization_endpoint: z.string().min(1),
    token_endpoint: z.string().min(1),
    registration_endpoint: z.string().min(1),
    revocation_endpoint: z.string().min(1).optional(),
    response_types_supported: z.array(z.string()),
    grant_types_supported: z.array(z.string()),
    token_endpoint_auth_methods_supported: z.array(z.string()),
    code_challenge_methods_supported: z.array(z.string()),
    scopes_supported: z.array(z.string()),
  })
  .passthrough();

export interface OAuthAuthorizationServerMetadata {
  issuer: URL;
  authorizationEndpoint: URL;
  tokenEndpoint: URL;
  registrationEndpoint: URL;
  revocationEndpoint?: URL;
  scopesSupported: readonly string[];
}

export interface OAuthMetadataDiscoveryOptions {
  issuer: URL;
  timeoutMs: number;
  fetch?: typeof globalThis.fetch;
}

export class OAuthDiscoveryError extends AccessAdapterError {
  constructor(code: string, message: string, status?: number) {
    super(
      code,
      message,
      status === undefined || status === 408 || status === 429 || status >= 500,
      status,
    );
    this.name = "OAuthDiscoveryError";
  }
}

export async function discoverOAuthMetadata(
  options: OAuthMetadataDiscoveryOptions,
): Promise<OAuthAuthorizationServerMetadata> {
  const fetch = options.fetch ?? globalThis.fetch;
  const metadataUrl = new URL("/.well-known/oauth-authorization-server", options.issuer);
  let response: Response;
  try {
    response = await fetch(metadataUrl, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch {
    throw new OAuthDiscoveryError(
      "oauth_discovery_unreachable",
      "The OAuth authorization server metadata could not be reached.",
    );
  }
  if (!response.ok) {
    throw new OAuthDiscoveryError(
      "oauth_discovery_rejected",
      "The OAuth authorization server rejected metadata discovery.",
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OAuthDiscoveryError(
      "oauth_invalid_metadata",
      "The OAuth authorization server returned invalid metadata.",
      response.status,
    );
  }
  const parsed = metadataSchema.safeParse(payload);
  if (!parsed.success) {
    throw new OAuthDiscoveryError(
      "oauth_invalid_metadata",
      "The OAuth authorization server returned invalid metadata.",
      response.status,
    );
  }

  const expectedIssuer = canonicalIssuer(options.issuer);
  if (canonicalIssuer(new URL(parsed.data.issuer)) !== expectedIssuer) {
    throw new OAuthDiscoveryError(
      "oauth_issuer_mismatch",
      "The discovered OAuth issuer does not match the configured issuer.",
      response.status,
    );
  }
  requireCapability(parsed.data.response_types_supported, "code", "response type");
  requireCapability(parsed.data.grant_types_supported, "authorization_code", "grant type");
  requireCapability(parsed.data.grant_types_supported, "refresh_token", "grant type");
  requireCapability(
    parsed.data.token_endpoint_auth_methods_supported,
    "none",
    "client auth method",
  );
  requireCapability(parsed.data.code_challenge_methods_supported, "S256", "PKCE method");

  return {
    issuer: new URL(parsed.data.issuer),
    authorizationEndpoint: trustedEndpoint(parsed.data.authorization_endpoint, options.issuer),
    tokenEndpoint: trustedEndpoint(parsed.data.token_endpoint, options.issuer),
    registrationEndpoint: trustedEndpoint(parsed.data.registration_endpoint, options.issuer),
    ...(parsed.data.revocation_endpoint
      ? { revocationEndpoint: trustedEndpoint(parsed.data.revocation_endpoint, options.issuer) }
      : {}),
    scopesSupported: parsed.data.scopes_supported,
  };
}

function requireCapability(values: readonly string[], required: string, label: string): void {
  if (!values.includes(required)) {
    throw new OAuthDiscoveryError(
      "oauth_capability_unsupported",
      `The OAuth authorization server does not support the required ${label}.`,
    );
  }
}

function trustedEndpoint(value: string, issuer: URL): URL {
  const endpoint = new URL(value);
  if (
    endpoint.origin !== issuer.origin ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash
  ) {
    throw new OAuthDiscoveryError(
      "oauth_untrusted_endpoint",
      "OAuth metadata contains an endpoint outside the configured issuer origin.",
    );
  }
  return endpoint;
}

function canonicalIssuer(value: URL): string {
  const issuer = new URL(value);
  issuer.pathname = issuer.pathname.replace(/\/+$/, "");
  issuer.search = "";
  issuer.hash = "";
  return issuer.toString();
}
