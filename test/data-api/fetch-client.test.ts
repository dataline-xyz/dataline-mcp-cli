import { describe, expect, it, vi } from "vitest";

import type { CredentialProvider } from "../../src/auth/credentials.js";
import type { DataApiError } from "../../src/data-api/error.js";
import { FetchDataApiClient, buildUrl } from "../../src/data-api/fetch-client.js";

const credentialProvider: CredentialProvider = {
  getHeaders: () => Promise.resolve({ "X-Dataline-Key": "secret" }),
};

describe("FetchDataApiClient", () => {
  it("encodes arrays as repeated query parameters and parses success envelopes", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({ code: 0, msg: "ok", data: { price: "100" } }, 200, {
        "x-request-id": "upstream-request",
      }),
    );
    const client = createClient(fetch);

    const result = await client.get<{ price: string }>("/crypto/cex/price", {
      base: "BTC",
      venues: ["binance", "okx"],
      empty: "",
    });

    expect(result).toEqual({
      data: { price: "100" },
      warnings: [],
      requestId: "upstream-request",
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    const requestUrl = url instanceof URL ? url.href : typeof url === "string" ? url : url?.url;
    expect(requestUrl).toBe(
      "https://data-api.example/api/crypto/cex/price?base=BTC&venues=binance&venues=okx",
    );
    const headers = new Headers(init?.headers);
    expect(headers.get("x-dataline-key")).toBe("secret");
    expect(headers.get("x-dataline-client")).toBe("local-mcp");
    expect(headers.get("user-agent")).toBe("dataline-mcp-cli/0.1.0");
    expect(headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps partial data and promotes the envelope error to a warning", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        jsonResponse({ code: "partial", msg: "one venue failed", data: { price: "100" } }),
      );
    const result = await createClient(fetch).get<{ price: string }>("/crypto/cex/price");

    expect(result.data).toEqual({ price: "100" });
    expect(result.warnings).toEqual([
      {
        code: "dataline_api_partial",
        message: "one venue failed",
        severity: "warning",
      },
    ]);
  });

  it("throws compact typed errors for HTTP and business failures", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ code: "rate_limited", msg: "slow down", data: null }, 429),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 1001, msg: "not found", data: null }));
    const client = createClient(fetch);

    await expect(client.get("/first")).rejects.toMatchObject({
      code: "dataline_api_rate_limited",
      retryable: true,
      status: 429,
    } satisfies Partial<DataApiError>);
    await expect(client.get("/second")).rejects.toMatchObject({
      code: "dataline_api_1001",
      retryable: false,
    } satisfies Partial<DataApiError>);
  });

  it("rejects invalid envelopes and oversized responses", async () => {
    const invalidFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse({ unexpected: true }));
    await expect(createClient(invalidFetch).get("/invalid")).rejects.toMatchObject({
      code: "dataline_api_invalid_envelope",
    });

    const largeFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse({ code: 0, data: { value: "too large" } }));
    await expect(createClient(largeFetch, 10).get("/large")).rejects.toMatchObject({
      code: "dataline_api_response_too_large",
    });
  });

  it("refreshes rejected credentials and retries once with the same request ID", async () => {
    let accessToken = "access-old";
    const recoveringProvider: CredentialProvider = {
      getHeaders: () => Promise.resolve({ Authorization: `Bearer ${accessToken}` }),
      recoverFromUnauthorized: vi.fn(() => {
        accessToken = "access-new";
        return Promise.resolve(true);
      }),
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: "unauthorized", data: null }, 401))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { price: "100" } }));
    const client = createClient(fetch, undefined, recoveringProvider);

    await expect(client.get("/crypto/cex/price")).resolves.toMatchObject({
      data: { price: "100" },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    const firstHeaders = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    const secondHeaders = new Headers(fetch.mock.calls[1]?.[1]?.headers);
    expect(firstHeaders.get("authorization")).toBe("Bearer access-old");
    expect(secondHeaders.get("authorization")).toBe("Bearer access-new");
    expect(secondHeaders.get("x-request-id")).toBe(firstHeaders.get("x-request-id"));
  });

  it("never retries a second unauthorized response", async () => {
    const recoverFromUnauthorized = vi.fn(() => Promise.resolve(true));
    const recoveringProvider: CredentialProvider = {
      getHeaders: () => Promise.resolve({ Authorization: "Bearer token" }),
      recoverFromUnauthorized,
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ code: "unauthorized", data: null }, 401)),
      );

    await expect(
      createClient(fetch, undefined, recoveringProvider).get("/private"),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(recoverFromUnauthorized.mock.calls).toHaveLength(1);
  });
});

describe("buildUrl", () => {
  it("keeps an optional base path and rejects authority-like paths", () => {
    expect(buildUrl(new URL("https://example.com/api"), "/v1/data").toString()).toBe(
      "https://example.com/api/v1/data",
    );
    expect(() => buildUrl(new URL("https://example.com"), "//evil.example/path")).toThrow(
      "exactly one slash",
    );
  });
});

function createClient(
  fetch: typeof globalThis.fetch,
  maxResponseBytes?: number,
  credentials: CredentialProvider = credentialProvider,
): FetchDataApiClient {
  return new FetchDataApiClient({
    baseUrl: new URL("https://data-api.example/api"),
    credentialProvider: credentials,
    timeoutMs: 1_000,
    version: "0.1.0",
    fetch,
    ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }),
  });
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
