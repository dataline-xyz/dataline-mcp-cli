import { describe, expect, it, vi } from "vitest";

import { discoverOAuthMetadata } from "../../../src/auth/oauth/metadata.js";

describe("OAuth metadata discovery", () => {
  it("discovers a compatible same-origin public PKCE server", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse(metadata()));

    await expect(
      discoverOAuthMetadata({
        issuer: new URL("https://control.example"),
        timeoutMs: 1_000,
        fetch,
      }),
    ).resolves.toMatchObject({
      issuer: new URL("https://control.example"),
      authorizationEndpoint: new URL("https://control.example/oauth/authorize"),
      tokenEndpoint: new URL("https://control.example/oauth/token"),
      registrationEndpoint: new URL("https://control.example/oauth/register"),
      scopesSupported: ["data.*.read"],
    });
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://control.example/.well-known/oauth-authorization-server"),
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("rejects issuer mismatch and cross-origin endpoints", async () => {
    await expect(discover(metadata({ issuer: "https://other.example" }))).rejects.toMatchObject({
      code: "oauth_issuer_mismatch",
    });
    await expect(
      discover(metadata({ token_endpoint: "https://other.example/oauth/token" })),
    ).rejects.toMatchObject({ code: "oauth_untrusted_endpoint" });
  });

  it("rejects servers without required refresh and PKCE capabilities", async () => {
    await expect(
      discover(metadata({ grant_types_supported: ["authorization_code"] })),
    ).rejects.toMatchObject({ code: "oauth_capability_unsupported" });
  });
});

function discover(payload: unknown) {
  return discoverOAuthMetadata({
    issuer: new URL("https://control.example"),
    timeoutMs: 1_000,
    fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse(payload)),
  });
}

function metadata(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
