import { describe, expect, it } from "vitest";

import {
  CredentialUnavailableError,
  createProfileCredentialProvider,
  credentialHeaders,
  inspectCredential,
} from "../../src/auth/credentials.js";
import type { ProfileSecrets, SecretStore } from "../../src/auth/secret-store.js";

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

  it("uses environment credentials before profile credentials", async () => {
    const secretStore = new MemorySecretStore({ apiKey: "stored-key" });
    const provider = createProfileCredentialProvider({
      authMode: "api_key",
      env: { DATALINE_API_KEY: "environment-key" },
      profileName: "default",
      secretStore,
    });

    await expect(provider.getHeaders()).resolves.toEqual({
      "X-Dataline-Key": "environment-key",
    });
    await expect(
      inspectCredential({
        authMode: "api_key",
        env: {},
        profileName: "default",
        secretStore,
      }),
    ).resolves.toEqual({ authenticated: true, source: "profile" });
  });
});

class MemorySecretStore implements SecretStore {
  constructor(private readonly secrets: ProfileSecrets) {}

  get(): Promise<ProfileSecrets> {
    return Promise.resolve(this.secrets);
  }

  setApiKey(): Promise<void> {
    return Promise.resolve();
  }

  setOAuth(): Promise<void> {
    return Promise.resolve();
  }

  clear(): Promise<void> {
    return Promise.resolve();
  }
}
