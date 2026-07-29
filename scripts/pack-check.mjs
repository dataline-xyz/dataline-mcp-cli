import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("npm_execpath is unavailable; run this script through npm run pack:check.");
}

const result = spawnSync(process.execPath, [npmCli, "pack", "--dry-run"], {
  env: {
    ...process.env,
    npm_config_cache: resolve(".npm-cache"),
  },
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
