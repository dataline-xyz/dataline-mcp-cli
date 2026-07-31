import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/program.js";

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
    });
    expect(output).not.toContain("token");
    expect(output).not.toContain("privateKey");
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
});

async function runCli(configDirectory: string, arguments_: string[], input = ""): Promise<string> {
  let output = "";
  const program = createCli({
    env: { DATALINE_CONFIG_HOME: configDirectory },
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
