import type { PaymentRequired, PaymentRequirements } from "@x402/fetch";
import { describe, expect, it, vi } from "vitest";

import { credentialHeaders } from "../../../src/auth/credentials.js";
import { createDatalinePaymentPolicy, createX402Fetch } from "../../../src/auth/x402/fetch.js";
import { FetchDataApiClient } from "../../../src/data-api/fetch-client.js";

const BASE_URL = new URL("https://data-api.example/api");
const NETWORK = "eip155:8453";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PRIVATE_KEY = `0x${"1".repeat(64)}` as const;

describe("Dataline x402 payment policy", () => {
  it("keeps only exact Base USDC requirements under the payment ceiling", () => {
    const policy = createDatalinePaymentPolicy(NETWORK, "0.001");
    const allowed = requirement({ amount: "1000" });
    const result = policy(2, [
      requirement({ amount: "1001" }),
      requirement({ scheme: "upto" }),
      requirement({ network: "eip155:84532" }),
      allowed,
    ]);

    expect(result).toEqual([allowed]);
  });

  it("fails closed when no challenge option satisfies the policy", () => {
    const policy = createDatalinePaymentPolicy(NETWORK, "0.001");
    expect(() => policy(1, [requirement()])).toThrow("version 2");
    expect(() => policy(2, [requirement({ amount: "1001" })])).toThrow(
      "within the 0.001 USD limit",
    );
  });
});

describe("Dataline x402 fetch", () => {
  it("turns one logical Data API operation into a challenge and one paid retry", async () => {
    const paymentRequired: PaymentRequired = {
      x402Version: 2,
      resource: {
        url: "https://data-api.example/api/crypto/cex/price?base=BTC",
        description: "Dataline Data API request",
        mimeType: "application/json",
      },
      accepts: [requirement()],
    };
    const requestIds: string[] = [];
    const upstreamFetch = vi.fn<typeof globalThis.fetch>((input, init) => {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
      requestIds.push(headers.get("x-request-id") ?? "");
      expect(headers.get("x-dataline-access-mode")).toBe("x402");

      if (!headers.has("payment-signature")) {
        return Promise.resolve(
          new Response(JSON.stringify(paymentRequired), {
            status: 402,
            headers: {
              "content-type": "application/json",
              "payment-required": encodeHeader(paymentRequired),
            },
          }),
        );
      }

      const payload = decodeHeader(headers.get("payment-signature")!);
      expect(payload).toMatchObject({
        x402Version: 2,
        accepted: { scheme: "exact", network: NETWORK, amount: "1000" },
      });
      return Promise.resolve(
        new Response(JSON.stringify({ code: 0, data: { price: "100" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    const paymentFetch = createX402Fetch({
      baseUrl: BASE_URL,
      network: NETWORK,
      maxPaymentUsd: "0.001",
      privateKey: PRIVATE_KEY,
      fetch: upstreamFetch,
    });
    const client = new FetchDataApiClient({
      baseUrl: BASE_URL,
      credentialProvider: {
        getHeaders: () => Promise.resolve(credentialHeaders("x402", {})),
      },
      timeoutMs: 1_000,
      version: "0.1.0",
      fetch: paymentFetch,
    });

    await expect(client.get("/crypto/cex/price", { base: "BTC" })).resolves.toMatchObject({
      data: { price: "100" },
    });
    expect(upstreamFetch).toHaveBeenCalledTimes(2);
    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).toBeTruthy();
    expect(requestIds[1]).toBe(requestIds[0]);
  });

  it("rejects requests outside the configured Data API base URL", async () => {
    const upstreamFetch = vi.fn<typeof globalThis.fetch>();
    const paymentFetch = createX402Fetch({
      baseUrl: BASE_URL,
      network: NETWORK,
      maxPaymentUsd: "0.001",
      privateKey: PRIVATE_KEY,
      fetch: upstreamFetch,
    });

    await expect(paymentFetch("https://example.com/paid")).rejects.toMatchObject({
      code: "x402_origin_not_allowed",
    });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});

function requirement(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: "exact",
    network: NETWORK,
    asset: USDC,
    amount: "1000",
    payTo: "0x0000000000000000000000000000000000000001",
    maxTimeoutSeconds: 300,
    extra: { name: "USDC", version: "2" },
    ...overrides,
  };
}

function encodeHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeHeader(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as unknown;
}
