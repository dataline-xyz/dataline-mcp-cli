import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileProfileStore } from "../../src/config/profile-store.js";

describe("FileProfileStore", () => {
  let directory: string;
  let path: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "dataline-profiles-"));
    path = join(directory, "nested", "profiles.json");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("provides a default profile and persists named profile selection", async () => {
    const store = new FileProfileStore(path);

    expect(await store.list()).toEqual([{ name: "default", active: true, settings: {} }]);
    await store.set("test", {
      authMode: "api_key",
      dataApiUrl: "https://data-api.test.example",
      requestTimeoutMs: 5_000,
    });
    await store.use("test");

    expect(await store.getActiveName()).toBe("test");
    expect(await store.get("test")).toEqual({
      authMode: "api_key",
      dataApiUrl: "https://data-api.test.example",
      requestTimeoutMs: 5_000,
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("rejects invalid and unknown profile names", async () => {
    const store = new FileProfileStore(path);

    await expect(store.set("bad profile", {})).rejects.toThrow("Profile names");
    await expect(store.use("missing")).rejects.toThrow("Unknown Dataline profile");
  });
});
