import { readFileSync } from "node:fs";

interface PackageMetadata {
  version?: unknown;
}

function readPackageVersion(): string {
  const packageUrl = new URL("../package.json", import.meta.url);
  const metadata = JSON.parse(readFileSync(packageUrl, "utf8")) as PackageMetadata;

  if (typeof metadata.version !== "string" || metadata.version.length === 0) {
    throw new Error("package.json is missing a valid version.");
  }

  return metadata.version;
}

export const VERSION = readPackageVersion();
