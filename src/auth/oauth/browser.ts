import open from "open";

export type OpenBrowser = (url: URL) => Promise<boolean>;

export async function openBrowser(url: URL): Promise<boolean> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return false;
  }

  try {
    // The opener handles shell quoting and waits for the Windows launcher, not the browser.
    const child = await open(url.toString(), { wait: false });
    return child.signalCode === null && (child.exitCode === null || child.exitCode === 0);
  } catch {
    return false;
  }
}
