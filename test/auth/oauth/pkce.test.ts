import { describe, expect, it } from "vitest";

import { createOAuthState, createPkcePair, pkceS256 } from "../../../src/auth/oauth/pkce.js";

describe("OAuth PKCE", () => {
  it("matches the RFC 7636 S256 example", () => {
    expect(pkceS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("creates verifier, challenge, and state values with safe entropy", () => {
    const pair = createPkcePair();
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/u);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(pair.challenge).toBe(pkceS256(pair.verifier));
    expect(createOAuthState()).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  });
});
