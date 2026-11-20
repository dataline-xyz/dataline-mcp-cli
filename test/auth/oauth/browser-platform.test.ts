import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const authorizationUrl = new URL("https://control.example/user's/oauth/authorize");
authorizationUrl.search = new URLSearchParams({
  response_type: "code",
  client_id: "oac_test",
  redirect_uri: "http://127.0.0.1:54321/callback",
  scope: "data.*.read",
  resource: "https://data-api.example",
  state: "opaque&state=$value%20",
  code_challenge: "a".repeat(43),
  code_challenge_method: "S256",
}).toString();

describe("browser launcher platform contract", () => {
  it("passes the entire URL as one quoted literal in an encoded Windows command", async () => {
    const launch = await captureLaunch("win32");

    expect(launch.command).toMatch(/powershell\.exe$/iu);
    expect(launch.arguments).toContain("-EncodedCommand");
    expect(launch.options.shell).not.toBe(true);
    const encodedCommand = launch.arguments.at(-1);
    if (!encodedCommand) throw new Error("Missing encoded PowerShell command.");
    const script = Buffer.from(encodedCommand, "base64").toString("utf16le");
    const quotedTarget = /\bStart '((?:[^']|'')*)'$/u.exec(script)?.[1];
    if (!quotedTarget) throw new Error("Missing single-quoted browser target.");

    const openedUrl = new URL(quotedTarget.replaceAll("''", "'"));
    expect(openedUrl.href).toBe(authorizationUrl.href);
    expect([...openedUrl.searchParams]).toEqual([...authorizationUrl.searchParams]);
    expect(script).not.toContain("-Wait");
  });

  it.each(["darwin", "linux"])("preserves the URL argument on %s", async (platform) => {
    const launch = await captureLaunch(platform);

    expect(launch.command).toMatch(/(?:^|\/)open$|xdg-open$/u);
    expect(launch.arguments.at(-1)).toBe(authorizationUrl.href);
    expect(launch.options.shell).not.toBe(true);
  });
});

async function captureLaunch(platform: string): Promise<{
  command: string;
  arguments: string[];
  options: { shell?: boolean };
}> {
  // Use the real dependency in an isolated platform simulation; never launch a browser.
  const script = `
    import childProcess from "node:child_process";
    import { EventEmitter } from "node:events";
    Object.defineProperty(process, "platform", { value: ${JSON.stringify(platform)} });
    childProcess.spawn = (command, args, options) => {
      process.stdout.write(JSON.stringify({ command, arguments: args, options }));
      const child = Object.assign(new EventEmitter(), {
        exitCode: null, signalCode: null, unref() {},
      });
      queueMicrotask(() => child.emit("spawn"));
      setImmediate(() => { child.exitCode = 0; child.emit("close", 0); });
      return child;
    };
    const { default: open } = await import("open");
    await open(${JSON.stringify(authorizationUrl.href)}, { wait: false });
  `;
  const { stdout } = await execute(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    timeout: 5_000,
  });
  return JSON.parse(stdout) as Awaited<ReturnType<typeof captureLaunch>>;
}
