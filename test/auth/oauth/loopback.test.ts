import { describe, expect, it } from "vitest";

import { startOAuthLoopbackServer } from "../../../src/auth/oauth/loopback.js";

describe("OAuth loopback callback", () => {
  it("accepts one code with the expected state", async () => {
    const callback = await startOAuthLoopbackServer({ state: "expected-state" });
    try {
      const result = callback.waitForCallback();
      const response = await fetch(
        `${callback.redirectUri}?code=authorization-code&state=expected-state`,
      );

      expect(response.status).toBe(200);
      await expect(result).resolves.toEqual({ code: "authorization-code" });
    } finally {
      await callback.close();
    }
  });

  it("fails closed on a state mismatch", async () => {
    const callback = await startOAuthLoopbackServer({ state: "expected-state" });
    try {
      const result = callback.waitForCallback();
      const rejection = expect(result).rejects.toMatchObject({ code: "oauth_state_mismatch" });
      const response = await fetch(`${callback.redirectUri}?code=secret&state=wrong-state`);

      expect(response.status).toBe(400);
      await rejection;
    } finally {
      await callback.close();
    }
  });

  it("rejects duplicate callback parameters", async () => {
    const callback = await startOAuthLoopbackServer({ state: "expected-state" });
    try {
      const result = callback.waitForCallback();
      const rejection = expect(result).rejects.toMatchObject({ code: "oauth_callback_invalid" });
      const response = await fetch(
        `${callback.redirectUri}?code=first&code=second&state=expected-state`,
      );

      expect(response.status).toBe(400);
      await rejection;
    } finally {
      await callback.close();
    }
  });
});
