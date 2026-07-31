import { createHash, randomBytes } from "node:crypto";

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(64).toString("base64url");
  return { verifier, challenge: pkceS256(verifier) };
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function pkceS256(verifier: string): string {
  if (!/^[A-Za-z0-9._~-]{43,128}$/u.test(verifier)) {
    throw new Error("PKCE verifier must contain 43 to 128 RFC 7636 unreserved characters.");
  }
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}
