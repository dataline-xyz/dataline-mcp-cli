import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export interface DatalinePaths {
  configDirectory: string;
  profilesFile: string;
  credentialsFile: string;
}

export function resolveDatalinePaths(env: NodeJS.ProcessEnv = process.env): DatalinePaths {
  const override = normalized(env.DATALINE_CONFIG_HOME);
  const xdgHome = normalized(env.XDG_CONFIG_HOME);
  const baseDirectory = override ?? join(xdgHome ?? join(homedir(), ".config"), "dataline");
  const configDirectory = isAbsolute(baseDirectory) ? baseDirectory : resolve(baseDirectory);

  return {
    configDirectory,
    profilesFile: join(configDirectory, "profiles.json"),
    credentialsFile: join(configDirectory, "credentials.json"),
  };
}

function normalized(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}
