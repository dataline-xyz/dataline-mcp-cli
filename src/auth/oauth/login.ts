import type { SecretStore } from "../secret-store.js";
import { openBrowser, type OpenBrowser } from "./browser.js";
import type { OAuthRuntimeConfig } from "./config.js";
import { startOAuthLoopbackServer } from "./loopback.js";
import { discoverOAuthMetadata } from "./metadata.js";
import { createOAuthState, createPkcePair } from "./pkce.js";
import { registerOAuthPublicClient } from "./registration-client.js";
import { FetchOAuthTokenClient } from "./token-client.js";

export interface OAuthLoginOptions {
  profileName: string;
  secretStore: SecretStore;
  config: OAuthRuntimeConfig;
  requestTimeoutMs: number;
  callbackTimeoutMs?: number;
  callbackPort?: number;
  launchBrowser?: boolean;
  fetch?: typeof globalThis.fetch;
  openBrowser?: OpenBrowser;
  onAuthorizationUrl?: (url: URL) => void;
  now?: () => number;
}

export interface OAuthLoginResult {
  expiresAt: number;
  scope: readonly string[];
  browserOpened: boolean;
}

export async function loginWithOAuth(options: OAuthLoginOptions): Promise<OAuthLoginResult> {
  const metadata = await discoverOAuthMetadata({
    issuer: options.config.issuer,
    timeoutMs: options.requestTimeoutMs,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const state = createOAuthState();
  const pkce = createPkcePair();
  const callback = await startOAuthLoopbackServer({
    state,
    ...(options.callbackPort === undefined ? {} : { port: options.callbackPort }),
    ...(options.callbackTimeoutMs === undefined ? {} : { timeoutMs: options.callbackTimeoutMs }),
  });

  try {
    const registration = await registerOAuthPublicClient({
      metadata,
      redirectUri: callback.redirectUri,
      scope: options.config.scope,
      resource: options.config.resource,
      timeoutMs: options.requestTimeoutMs,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    const authorizationUrl = buildAuthorizationUrl({
      endpoint: metadata.authorizationEndpoint,
      clientId: registration.clientId,
      redirectUri: callback.redirectUri,
      scope: options.config.scope,
      resource: options.config.resource,
      state,
      codeChallenge: pkce.challenge,
    });
    options.onAuthorizationUrl?.(authorizationUrl);

    const browserOpened =
      options.launchBrowser === false
        ? false
        : await (options.openBrowser ?? openBrowser)(authorizationUrl).catch(() => false);
    const callbackResult = await callback.waitForCallback();
    const tokenClient = new FetchOAuthTokenClient({
      tokenEndpoint: metadata.tokenEndpoint,
      clientId: registration.clientId,
      resource: options.config.resource,
      timeoutMs: options.requestTimeoutMs,
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
    const token = await tokenClient.exchangeAuthorizationCode({
      code: callbackResult.code,
      codeVerifier: pkce.verifier,
      redirectUri: callback.redirectUri,
    });
    const scope = token.scope ?? options.config.scope.split(/\s+/u);
    await options.secretStore.setOAuth(options.profileName, {
      ...token,
      scope,
      client: {
        issuer: metadata.issuer.toString(),
        clientId: registration.clientId,
        tokenEndpoint: metadata.tokenEndpoint.toString(),
        ...(metadata.revocationEndpoint
          ? { revocationEndpoint: metadata.revocationEndpoint.toString() }
          : {}),
        resource: options.config.resource,
      },
    });
    return { expiresAt: token.expiresAt, scope, browserOpened };
  } finally {
    await callback.close();
  }
}

export function buildAuthorizationUrl(options: {
  endpoint: URL;
  clientId: string;
  redirectUri: string;
  scope: string;
  resource: string;
  state: string;
  codeChallenge: string;
}): URL {
  const url = new URL(options.endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    scope: options.scope,
    resource: options.resource,
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url;
}
