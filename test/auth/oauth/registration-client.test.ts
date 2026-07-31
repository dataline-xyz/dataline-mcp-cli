import { describe, expect, it, vi } from "vitest";

import type { OAuthAuthorizationServerMetadata } from "../../../src/auth/oauth/metadata.js";
import { registerOAuthPublicClient } from "../../../src/auth/oauth/registration-client.js";

describe("OAuth public client registration", () => {
  it("registers an exact loopback redirect with refresh and resource bindings", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse(
        {
          client_id: "oac_cli",
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["http://127.0.0.1:49152/callback"],
          scope: "data.*.read",
        },
        201,
      ),
    );

    await expect(
      registerOAuthPublicClient({
        metadata: serverMetadata(),
        redirectUri: "http://127.0.0.1:49152/callback",
        scope: "data.*.read",
        resource: "https://data-api.example",
        timeoutMs: 1_000,
        fetch,
      }),
    ).resolves.toEqual({
      clientId: "oac_cli",
      redirectUri: "http://127.0.0.1:49152/callback",
    });

    const init = fetch.mock.calls[0]?.[1];
    expect(typeof init?.body).toBe("string");
    expect(JSON.parse(init?.body as string)).toEqual({
      client_name: "Dataline MCP and CLI",
      redirect_uris: ["http://127.0.0.1:49152/callback"],
      scope: "data.*.read",
      allowed_resources: ["https://data-api.example"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  it("rejects scopes that are not advertised", async () => {
    await expect(
      registerOAuthPublicClient({
        metadata: serverMetadata(),
        redirectUri: "http://127.0.0.1:49152/callback",
        scope: "control.me.read",
        resource: "https://data-api.example",
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({ code: "oauth_scope_unsupported" });
  });
});

function serverMetadata(): OAuthAuthorizationServerMetadata {
  return {
    issuer: new URL("https://control.example"),
    authorizationEndpoint: new URL("https://control.example/oauth/authorize"),
    tokenEndpoint: new URL("https://control.example/oauth/token"),
    registrationEndpoint: new URL("https://control.example/oauth/register"),
    revocationEndpoint: new URL("https://control.example/oauth/revoke"),
    scopesSupported: ["data.*.read"],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
