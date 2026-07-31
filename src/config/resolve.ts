import { FileSecretStore, type SecretStore } from "../auth/secret-store.js";
import { resolveDatalinePaths } from "./paths.js";
import { FileProfileStore, type ProfileSettings, type ProfileStore } from "./profile-store.js";
import { loadRuntimeConfig, type RuntimeConfig, type RuntimeDefaults } from "./runtime.js";

export interface RuntimeContext {
  profileName: string;
  profile: ProfileSettings;
  config: RuntimeConfig;
  profileStore: ProfileStore;
  secretStore: SecretStore;
}

export interface RuntimeContextOptions {
  profileStore?: ProfileStore;
  secretStore?: SecretStore;
}

export async function resolveRuntimeContext(
  env: NodeJS.ProcessEnv = process.env,
  options: RuntimeContextOptions = {},
): Promise<RuntimeContext> {
  const paths = resolveDatalinePaths(env);
  const profileStore = options.profileStore ?? new FileProfileStore(paths.profilesFile);
  const secretStore = options.secretStore ?? new FileSecretStore(paths.credentialsFile);
  const requestedProfile = env.DATALINE_PROFILE?.trim();
  const profileName = requestedProfile || (await profileStore.getActiveName());
  const profile = await profileStore.get(profileName);

  if (!profile) {
    throw new Error(`Unknown Dataline profile: ${profileName}.`);
  }

  const defaults: RuntimeDefaults = {
    ...(profile.authMode === undefined ? {} : { authMode: profile.authMode }),
    ...(profile.dataApiUrl === undefined ? {} : { dataApiUrl: profile.dataApiUrl }),
    ...(profile.requestTimeoutMs === undefined
      ? {}
      : { requestTimeoutMs: profile.requestTimeoutMs }),
  };

  return {
    profileName,
    profile,
    config: loadRuntimeConfig(env, defaults),
    profileStore,
    secretStore,
  };
}
