import { ChildProcess } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import open from "open";

import { openBrowser } from "../../../src/auth/oauth/browser.js";

vi.mock("open", () => ({ default: vi.fn() }));

describe("OAuth browser opener", () => {
  beforeEach(() => {
    vi.mocked(open).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes the full authorization URL without waiting for the browser to close", async () => {
    const url = new URL("https://control.example/oauth/authorize");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: "oac_test",
      redirect_uri: "http://127.0.0.1:54321/callback",
      scope: "data.*.read",
      resource: "https://data-api.example",
      state: "opaque-state",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
    }).toString();
    vi.mocked(open).mockResolvedValue(launcher(null));

    await expect(openBrowser(url)).resolves.toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith(url.href, { wait: false });
  });

  it("allows HTTP loopback URLs", async () => {
    vi.mocked(open).mockResolvedValue(launcher(0));

    await expect(openBrowser(new URL("http://127.0.0.1:54321/authorize"))).resolves.toBe(true);
  });

  it.each(["file:///tmp/login", "javascript:alert(1)"])(
    "rejects non-HTTP URLs: %s",
    async (url) => {
      await expect(openBrowser(new URL(url))).resolves.toBe(false);
      expect(open).not.toHaveBeenCalled();
    },
  );

  it("returns false when the launcher fails to start", async () => {
    vi.mocked(open).mockRejectedValue(new Error("Browser launcher unavailable"));

    await expect(openBrowser(new URL("https://control.example/authorize"))).resolves.toBe(false);
  });

  it("returns false when the Windows launcher exits unsuccessfully", async () => {
    vi.mocked(open).mockResolvedValue(launcher(1));

    await expect(openBrowser(new URL("https://control.example/authorize"))).resolves.toBe(false);
  });

  it("returns false when the launcher is terminated", async () => {
    const child = launcher(null);
    Object.defineProperty(child, "signalCode", { value: "SIGTERM" });
    vi.mocked(open).mockResolvedValue(child);

    await expect(openBrowser(new URL("https://control.example/authorize"))).resolves.toBe(false);
  });
});

function launcher(exitCode: number | null): Awaited<ReturnType<typeof open>> {
  const child = new ChildProcess();
  Object.defineProperty(child, "exitCode", { value: exitCode });
  return child;
}
