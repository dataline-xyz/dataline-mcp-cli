import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileSecretStore } from "../../src/auth/secret-store.js";

describe("FileSecretStore", () => {
  let directory: string;
  let path: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "dataline-secrets-"));
    path = join(directory, "nested", "credentials.json");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("atomically persists profile-scoped credentials with private permissions", async () => {
    const store = new FileSecretStore(path);
    await store.setApiKey("default", " api-key ");
    await store.setOAuth("default", {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 60_000,
      tokenType: "Bearer",
      scope: ["data.read"],
    });

    expect(await store.get("default")).toMatchObject({
      apiKey: "api-key",
      oauth: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        tokenType: "Bearer",
      },
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readFile(path, "utf8")).not.toContain("privateKey");

    await store.clear("default");
    expect(await store.get("default")).toEqual({});
  });
});
