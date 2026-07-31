import { describe, expect, it } from "vitest";

import {
  decimalToAtomic,
  loadX402Config,
  parseMaxPaymentUsd,
  parseX402PrivateKey,
  parseX402Network,
} from "../../../src/auth/x402/config.js";

describe("x402 config", () => {
  it("defaults to Base Sepolia with a 0.001 USD payment ceiling", () => {
    expect(
      loadX402Config({
        DATALINE_X402_PRIVATE_KEY: `0x${"1".repeat(64)}`,
      }),
    ).toEqual({
      network: "eip155:84532",
      maxPaymentUsd: "0.001",
      privateKey: `0x${"1".repeat(64)}`,
    });
  });

  it("accepts only Base networks, positive USDC precision, and a hex private key", () => {
    expect(parseX402Network("eip155:8453")).toBe("eip155:8453");
    expect(parseMaxPaymentUsd("0.000001")).toBe("0.000001");
    expect(decimalToAtomic("0.001", 6)).toBe(1_000n);
    expect(() => parseX402Network("eip155:1")).toThrow("Expected one of");
    expect(() => parseMaxPaymentUsd("0.0000001")).toThrow("at most 6");
    expect(() => parseX402PrivateKey("0x1234")).toThrow("32-byte hex");
    expect(() => loadX402Config({})).toThrow("DATALINE_X402_PRIVATE_KEY");
  });
});
