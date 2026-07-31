import { describe, expect, it, vi } from "vitest";

import { loginWithOAuth } from "../../../src/auth/oauth/login.js";
import type { OAuthTokenSet, ProfileSecrets, SecretStore } from "../../../src/auth/secret-store.js";

const NOW = 1_700_000_000_000;

describe("OAuth login", () => {
  it("completes discovery, registration, loopback PKCE, exchange, and persistence", async () => {
    const store = new MemorySecretStore();
    let registeredRedirectUri = "";
    const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
      const url = requestUrl(input);
      switch (url.pathname) {
        case "/.well-known/oauth-authorization-server":
          return Promise.resolve(jsonResponse(metadata()));
        case "/oauth/register": {
          if (typeof init?.body !== "string") throw new Error("Expected JSON request body.");
          const payload = JSON.parse(init.body) as { redirect_uris: string[] };
          registeredRedirectUri = payload.redirect_uris[0] ?? "";
          return Promise.resolve(
            jsonResponse(
              {
                client_id: "oac_cli",
                token_endpoint_auth_method: "none",
                grant_types: ["authorization_code", "refresh_token"],
                redirect_uris: [registeredRedirectUri],
                scope: "data.*.read",
              },
              201,
            ),
          );
        }
        case "/oauth/token":
          expect(init?.body).toBeInstanceOf(URLSearchParams);
          expect((init?.body as URLSearchParams).get("resource")).toBe("https://data-api.example");
          expect((init?.body as URLSearchParams).get("code_verifier")).toMatch(
            /^[A-Za-z0-9_-]{43,128}$/u,
          );
          return Promise.resolve(
            jsonResponse({
              access_token: "access-token",
              refresh_token: "refresh-token",
              expires_in: 3600,
              token_type: "Bearer",
              scope: "data.*.read",
            }),
          );
        default:
          throw new Error(`Unexpected request: ${url.toString()}`);
      }
    });
    let authorizationUrl: URL | undefined;

    const result = await loginWithOAuth({
      profileName: "default",
      secretStore: store,
      config: {
        issuer: new URL("https://control.example"),
        scope: "data.*.read",
        resource: "https://data-api.example",
      },
      requestTimeoutMs: 1_000,
      fetch,
      now: () => NOW,
      onAuthorizationUrl: (url) => {
        authorizationUrl = url;
      },
      openBrowser: async (url) => {
        const redirectUri = url.searchParams.get("redirect_uri");
        const state = url.searchParams.get("state");
        if (!redirectUri || !state) throw new Error("Missing callback parameters.");
        const response = await globalThis.fetch(
          `${redirectUri}?code=authorization-code&state=${encodeURIComponent(state)}`,
        );
        expect(response.status).toBe(200);
        return true;
      },
    });

    expect(result).toEqual({
      expiresAt: NOW + 3_600_000,
      scope: ["data.*.read"],
      browserOpened: true,
    });
    expect(authorizationUrl?.origin).toBe("https://control.example");
    expect(authorizationUrl?.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl?.searchParams.get("resource")).toBe("https://data-api.example");
    expect(registeredRedirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/u);
    expect(store.secrets.oauth).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: NOW + 3_600_000,
      tokenType: "Bearer",
      scope: ["data.*.read"],
      client: {
        issuer: "https://control.example/",
        clientId: "oac_cli",
        tokenEndpoint: "https://control.example/oauth/token",
        revocationEndpoint: "https://control.example/oauth/revoke",
        resource: "https://data-api.example",
      },
    });
  });
});

class MemorySecretStore implements SecretStore {
  secrets: ProfileSecrets = {};

  get(): Promise<ProfileSecrets> {
    return Promise.resolve(this.secrets);
  }

  setApiKey(_profile: string, apiKey: string): Promise<void> {
    this.secrets = { ...this.secrets, apiKey };
    return Promise.resolve();
  }

  setOAuth(_profile: string, oauth: OAuthTokenSet): Promise<void> {
    this.secrets = { ...this.secrets, oauth };
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.secrets = {};
    return Promise.resolve();
  }
}

function metadata() {
  return {
    issuer: "https://control.example",
    authorization_endpoint: "https://control.example/oauth/authorize",
    token_endpoint: "https://control.example/oauth/token",
    registration_endpoint: "https://control.example/oauth/register",
    revocation_endpoint: "https://control.example/oauth/revoke",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["data.*.read"],
  };
}

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): URL {
  if (input instanceof URL) return input;
  if (typeof input === "string") return new URL(input);
  return new URL(input.url);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
