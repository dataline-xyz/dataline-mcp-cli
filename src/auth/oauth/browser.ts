import { spawn } from "node:child_process";

export type OpenBrowser = (url: URL) => Promise<boolean>;

export async function openBrowser(url: URL): Promise<boolean> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return false;
  }

  const command = browserCommand(url.toString());
  return new Promise((resolve) => {
    const child = spawn(command.executable, command.arguments, {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", () => {
      resolve(false);
    });
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}

function browserCommand(url: string): { executable: string; arguments: string[] } {
  switch (process.platform) {
    case "darwin":
      return { executable: "open", arguments: [url] };
    case "win32":
      return { executable: "cmd.exe", arguments: ["/d", "/s", "/c", "start", "", url] };
    default:
      return { executable: "xdg-open", arguments: [url] };
  }
}
