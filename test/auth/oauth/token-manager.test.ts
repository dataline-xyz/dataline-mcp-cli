import { describe, expect, it, vi } from "vitest";

import { OAuthTokenManager } from "../../../src/auth/oauth/token-manager.js";
import type { OAuthRefreshResult, OAuthTokenClient } from "../../../src/auth/oauth/token-client.js";
import type { OAuthTokenSet, ProfileSecrets, SecretStore } from "../../../src/auth/secret-store.js";

const NOW = 2_000_000;

describe("OAuthTokenManager", () => {
  it("uses a token outside the expiry skew without refreshing", async () => {
    const store = new MemorySecretStore({ oauth: tokens({ expiresAt: NOW + 120_000 }) });
    const tokenClient = new StubTokenClient();
    const manager = createManager(store, tokenClient);

    await expect(manager.getAccessToken()).resolves.toBe("access-old");
    expect(tokenClient.refresh.mock.calls).toHaveLength(0);
  });

  it("refreshes an expiring token and persists refresh-token rotation", async () => {
    const store = new MemorySecretStore({ oauth: tokens({ expiresAt: NOW + 30_000 }) });
    const tokenClient = new StubTokenClient({
      accessToken: "access-new",
      refreshToken: "refresh-new",
      expiresAt: NOW + 3_600_000,
      tokenType: "Bearer",
      scope: ["data.read"],
    });
    const manager = createManager(store, tokenClient);

    await expect(manager.getAccessToken()).resolves.toBe("access-new");
    expect(tokenClient.refresh.mock.calls).toHaveLength(1);
    expect(store.secrets.oauth).toEqual({
      accessToken: "access-new",
      refreshToken: "refresh-new",
      expiresAt: NOW + 3_600_000,
      tokenType: "Bearer",
      scope: ["data.read"],
    });
  });

  it("coalesces concurrent refreshes into one token request", async () => {
    const store = new MemorySecretStore({ oauth: tokens({ expiresAt: NOW }) });
    const refresh = deferred<OAuthRefreshResult>();
    const refreshToken = vi.fn(() => refresh.promise);
    const tokenClient: OAuthTokenClient = { refresh: refreshToken };
    const manager = createManager(store, tokenClient);

    const first = manager.getAccessToken();
    const second = manager.getAccessToken();
    refresh.resolve({
      accessToken: "access-new",
      expiresAt: NOW + 3_600_000,
      tokenType: "Bearer",
    });

    await expect(Promise.all([first, second])).resolves.toEqual(["access-new", "access-new"]);
    expect(refreshToken.mock.calls).toHaveLength(1);
  });

  it("does not refresh again when another request already replaced a rejected token", async () => {
    const store = new MemorySecretStore({ oauth: tokens({ accessToken: "access-new" }) });
    const tokenClient = new StubTokenClient();
    const manager = createManager(store, tokenClient);

    await expect(manager.recoverFromUnauthorized("access-old")).resolves.toBe(true);
    expect(tokenClient.refresh.mock.calls).toHaveLength(0);
  });

  it("fails closed when an expired session cannot be refreshed", async () => {
    const store = new MemorySecretStore({
      oauth: tokens({ expiresAt: NOW, refreshToken: undefined }),
    });
    const manager = new OAuthTokenManager({
      profileName: "default",
      secretStore: store,
      now: () => NOW,
    });

    await expect(manager.getAccessToken()).rejects.toMatchObject({
      code: "oauth_refresh_token_missing",
    });
  });
});

class StubTokenClient implements OAuthTokenClient {
  readonly refresh = vi.fn<(refreshToken: string) => Promise<OAuthRefreshResult>>();

  constructor(result?: OAuthRefreshResult) {
    if (result) {
      this.refresh.mockResolvedValue(result);
    }
  }
}

class MemorySecretStore implements SecretStore {
  constructor(public secrets: ProfileSecrets) {}

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

function createManager(secretStore: SecretStore, tokenClient: OAuthTokenClient): OAuthTokenManager {
  return new OAuthTokenManager({
    profileName: "default",
    secretStore,
    tokenClient,
    now: () => NOW,
  });
}

function tokens(overrides: Partial<OAuthTokenSet> = {}): OAuthTokenSet {
  return {
    accessToken: "access-old",
    refreshToken: "refresh-old",
    expiresAt: NOW + 3_600_000,
    tokenType: "Bearer",
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
