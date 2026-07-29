import { readFileSync } from "node:fs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const packageJson = readJson("package.json");
const serverJson = readJson("server.json");
const npmPackage = serverJson.packages?.find(({ registryType }) => registryType === "npm");

const checks = [
  [serverJson.name === packageJson.mcpName, "server.json name must match package.json mcpName"],
  [
    serverJson.version === packageJson.version,
    "server.json version must match package.json version",
  ],
  [npmPackage, "server.json must declare an npm package"],
  [
    npmPackage?.identifier === packageJson.name,
    "server.json npm identifier must match package name",
  ],
  [
    npmPackage?.version === packageJson.version,
    "server.json npm version must match package version",
  ],
];

const releaseTag = process.env.RELEASE_TAG;
if (releaseTag) {
  checks.push([
    releaseTag === `v${packageJson.version}`,
    "release tag must match package version with a v prefix",
  ]);
}

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);
if (failures.length > 0) {
  throw new Error(`Release metadata is invalid:\n- ${failures.join("\n- ")}`);
}

process.stdout.write(`Release metadata matches version ${packageJson.version}.\n`);
