import { describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/program.js";

describe("CLI", () => {
  it("prints effective config without credential material", async () => {
    let output = "";
    const program = createCli({
      env: {},
      stdout: {
        write(chunk) {
          output += String(chunk);
          return true;
        },
      },
    });

    await program.parseAsync(["node", "dataline", "config", "show"]);

    expect(JSON.parse(output)).toEqual({
      authMode: "oauth",
      dataApiUrl: "https://data-api.dataline.xyz/",
      requestTimeoutMs: 30_000,
    });
    expect(output).not.toContain("token");
    expect(output).not.toContain("privateKey");
  });
});
