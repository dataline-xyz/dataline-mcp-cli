import { describe, expect, it } from "vitest";

import {
  DATALINE_ACCESS_MODE_HEADER,
  buildAccessModeHeaders,
  loadRuntimeConfig,
  parseAuthMode,
  parseDataApiUrl,
} from "../../src/config/runtime.js";

describe("runtime config", () => {
  it("uses production-safe defaults", () => {
    const config = loadRuntimeConfig({});

    expect(config.authMode).toBe("oauth");
    expect(config.dataApiUrl.toString()).toBe("https://data-api.dataline.xyz/");
  });

  it("accepts each explicit authentication mode", () => {
    expect(parseAuthMode("oauth")).toBe("oauth");
    expect(parseAuthMode("API_KEY")).toBe("api_key");
    expect(parseAuthMode(" x402 ")).toBe("x402");
  });

  it("rejects ambiguous access modes instead of falling back", () => {
    expect(() => parseAuthMode("auto")).toThrow("Invalid DATALINE_AUTH_MODE");
  });

  it("normalizes a Data API origin without query or fragment", () => {
    expect(parseDataApiUrl("http://127.0.0.1:8008/api/?debug=1#x").toString()).toBe(
      "http://127.0.0.1:8008/api",
    );
  });

  it("only sends the access-mode header for x402", () => {
    expect(buildAccessModeHeaders("oauth")).toEqual({});
    expect(buildAccessModeHeaders("api_key")).toEqual({});
    expect(buildAccessModeHeaders("x402")).toEqual({
      [DATALINE_ACCESS_MODE_HEADER]: "x402",
    });
  });
});
