import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OAuthLoginOptions, OAuthLoginResult } from "../../src/auth/oauth/login.js";
import { createCli, type CliDependencies } from "../../src/cli/program.js";

describe("CLI", () => {
  let configDirectory: string;

  beforeEach(async () => {
    configDirectory = await mkdtemp(join(tmpdir(), "dataline-cli-"));
  });

  afterEach(async () => {
    await rm(configDirectory, { recursive: true, force: true });
  });

  it("prints effective config without credential material", async () => {
    const output = await runCli(configDirectory, ["config", "show"]);

    expect(JSON.parse(output)).toEqual({
      profile: "default",
      authMode: "oauth",
      dataApiUrl: "https://data-api.dataline.xyz/",
      requestTimeoutMs: 30_000,
      oauth: {
        issuer: "https://control-api.dataline.xyz/",
        scope: "data.*.read",
        resource: "https://data-api.dataline.xyz",
      },
    });
    expect(output).not.toContain("token");
    expect(output).not.toContain("privateKey");
  });

  it("runs OAuth login without exposing credentials in command output", async () => {
    let output = "";
    let errorOutput = "";
    const oauthLogin: NonNullable<CliDependencies["oauthLogin"]> = vi.fn(
      (options: OAuthLoginOptions): Promise<OAuthLoginResult> => {
        options.onAuthorizationUrl?.(
          new URL("https://control.example/oauth/authorize?state=redacted"),
        );
        return Promise.resolve({
          expiresAt: 1_700_003_600_000,
          scope: ["data.*.read"],
          browserOpened: false,
        });
      },
    );
    const program = createCli({
      env: { DATALINE_CONFIG_HOME: configDirectory },
      stdout: {
        write(chunk) {
          output += String(chunk);
          return true;
        },
      },
      stderr: {
        write(chunk) {
          errorOutput += String(chunk);
          return true;
        },
      },
      oauthLogin,
    });

    await program.parseAsync(["node", "dataline", "auth", "login", "--no-open", "--port", "0"]);

    expect(JSON.parse(output)).toEqual({
      profile: "default",
      authMode: "oauth",
      authenticated: true,
      expiresAt: 1_700_003_600_000,
      scope: ["data.*.read"],
      browserOpened: false,
    });
    expect(errorOutput).toContain("https://control.example/oauth/authorize");
    expect(oauthLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackPort: 0,
        callbackTimeoutMs: 300_000,
        launchBrowser: false,
      }),
    );
  });

  it("shares profile and API key state across CLI processes", async () => {
    await runCli(configDirectory, ["profile", "set", "default", "--auth-mode", "api_key"]);
    await runCli(configDirectory, ["auth", "set-api-key", "--stdin"], "profile-key\n");

    expect(JSON.parse(await runCli(configDirectory, ["auth", "status"]))).toEqual({
      profile: "default",
      authMode: "api_key",
      authenticated: true,
      source: "profile",
    });

    await runCli(configDirectory, ["auth", "logout"]);
    expect(JSON.parse(await runCli(configDirectory, ["auth", "status"]))).toMatchObject({
      authenticated: false,
      source: "none",
    });
  });

  it("shows x402 policy and wallet availability without exposing the private key", async () => {
    const env = {
      DATALINE_AUTH_MODE: "x402",
      DATALINE_X402_NETWORK: "eip155:8453",
      DATALINE_X402_MAX_PAYMENT_USD: "0.001",
      DATALINE_X402_PRIVATE_KEY: `0x${"1".repeat(64)}`,
    };
    const configOutput = await runCli(configDirectory, ["config", "show"], "", env);

    expect(JSON.parse(configOutput)).toMatchObject({
      authMode: "x402",
      x402: { network: "eip155:8453", maxPaymentUsd: "0.001" },
    });
    expect(configOutput).not.toContain(env.DATALINE_X402_PRIVATE_KEY);
    await expect(
      runCli(configDirectory, ["auth", "status"], "", env).then(JSON.parse),
    ).resolves.toMatchObject({ authenticated: true, source: "environment" });
  });
});

async function runCli(
  configDirectory: string,
  arguments_: string[],
  input = "",
  env: NodeJS.ProcessEnv = {},
): Promise<string> {
  let output = "";
  const program = createCli({
    env: { DATALINE_CONFIG_HOME: configDirectory, ...env },
    stdin: Readable.from([input]),
    stdout: {
      write(chunk) {
        output += String(chunk);
        return true;
      },
    },
  });

  await program.parseAsync(["node", "dataline", ...arguments_]);
  return output;
}
