import { describe, expect, it } from "vitest";

import { CredentialUnavailableError, credentialHeaders } from "../../src/auth/credentials.js";

describe("credential headers", () => {
  it("builds OAuth and API key headers without access-mode hints", () => {
    expect(credentialHeaders("oauth", { DATALINE_ACCESS_TOKEN: " token " })).toEqual({
      Authorization: "Bearer token",
    });
    expect(credentialHeaders("api_key", { DATALINE_API_KEY: " key " })).toEqual({
      "X-Dataline-Key": "key",
    });
  });

  it("fails clearly when credentials or x402 support are unavailable", () => {
    expect(() => credentialHeaders("oauth", {})).toThrow(CredentialUnavailableError);
    expect(() => credentialHeaders("api_key", {})).toThrow("DATALINE_API_KEY");
    expect(() => credentialHeaders("x402", {})).toThrow("not available");
  });
});
