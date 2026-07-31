import { describe, expect, it } from "vitest";

import {
  loadOAuthRuntimeConfig,
  parseOAuthIssuer,
  parseOAuthResource,
  parseOAuthScope,
} from "../../../src/auth/oauth/config.js";

describe("OAuth runtime config", () => {
  it("uses production defaults and binds the token resource to Data API", () => {
    expect(loadOAuthRuntimeConfig(new URL("https://data-api.dataline.xyz/"), {})).toEqual({
      issuer: new URL("https://control-api.dataline.xyz/"),
      scope: "data.*.read",
      resource: "https://data-api.dataline.xyz",
    });
  });

  it("allows HTTP only for local development issuers and resources", () => {
    expect(parseOAuthIssuer("http://127.0.0.1:8020").href).toBe("http://127.0.0.1:8020/");
    expect(parseOAuthResource("http://data-api.test:8008")).toBe("http://data-api.test:8008");
    expect(() => parseOAuthIssuer("http://control.example.com")).toThrow(/must use HTTPS/u);
    expect(() => parseOAuthResource("http://data.example.com")).toThrow(/must use HTTPS/u);
  });

  it("normalizes scopes and rejects duplicate values", () => {
    expect(parseOAuthScope(" data.crypto.price.read   data.project.read ")).toBe(
      "data.crypto.price.read data.project.read",
    );
    expect(() => parseOAuthScope("data.read data.read")).toThrow(/unique/u);
  });
});
