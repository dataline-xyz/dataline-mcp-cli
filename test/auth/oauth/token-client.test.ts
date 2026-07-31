import { describe, expect, it, vi } from "vitest";

import { FetchOAuthTokenClient } from "../../../src/auth/oauth/token-client.js";

describe("FetchOAuthTokenClient", () => {
  it("submits a refresh grant and normalizes the token response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({
        access_token: "access-new",
        refresh_token: "refresh-new",
        expires_in: 3600,
        token_type: "bearer",
        scope: "data.read profile.read",
      }),
    );
    const client = createClient(fetch);

    await expect(client.refresh("refresh-old")).resolves.toEqual({
      accessToken: "access-new",
      refreshToken: "refresh-new",
      expiresAt: 4_600_000,
      tokenType: "Bearer",
      scope: ["data.read", "profile.read"],
    });

    const [url, init] = fetch.mock.calls[0] ?? [];
    const requestUrl = url instanceof URL ? url.href : typeof url === "string" ? url : url?.url;
    expect(requestUrl).toBe("https://control.example/oauth/token");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    expect((init?.body as URLSearchParams).toString()).toBe(
      "grant_type=refresh_token&refresh_token=refresh-old&client_id=dataline-cli",
    );
  });

  it("returns a compact error without exposing the token response body", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse({ error: "invalid_grant", detail: "sensitive" }, 400));

    await expect(createClient(fetch).refresh("refresh-old")).rejects.toMatchObject({
      code: "oauth_invalid_grant",
      status: 400,
      message: "The OAuth token endpoint rejected the token request.",
    });
  });

  it("exchanges an authorization code with PKCE and a bound resource", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({
        access_token: "access-new",
        refresh_token: "refresh-new",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "data.*.read",
      }),
    );
    const client = new FetchOAuthTokenClient({
      tokenEndpoint: new URL("https://control.example/oauth/token"),
      clientId: "dataline-cli",
      resource: "https://data-api.example",
      timeoutMs: 1_000,
      fetch,
      now: () => 1_000_000,
    });

    await client.exchangeAuthorizationCode({
      code: "authorization-code",
      codeVerifier: "a".repeat(64),
      redirectUri: "http://127.0.0.1:49152/callback",
    });

    expect((fetch.mock.calls[0]?.[1]?.body as URLSearchParams).toString()).toBe(
      "grant_type=authorization_code&client_id=dataline-cli&redirect_uri=http%3A%2F%2F127.0.0.1%3A49152%2Fcallback&code=authorization-code&code_verifier=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&resource=https%3A%2F%2Fdata-api.example",
    );
  });
});

function createClient(fetch: typeof globalThis.fetch): FetchOAuthTokenClient {
  return new FetchOAuthTokenClient({
    tokenEndpoint: new URL("https://control.example/oauth/token"),
    clientId: "dataline-cli",
    timeoutMs: 1_000,
    fetch,
    now: () => 1_000_000,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
