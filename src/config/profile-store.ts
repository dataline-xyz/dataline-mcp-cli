import { z } from "zod";

import { AUTH_MODES } from "./runtime.js";
import { readPrivateJson, writePrivateJson } from "../storage/private-json.js";

const PROFILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const profileSettingsSchema = z
  .object({
    authMode: z.enum(AUTH_MODES).optional(),
    dataApiUrl: z.string().min(1).optional(),
    requestTimeoutMs: z.number().int().min(100).max(300_000).optional(),
    oauthIssuer: z.string().min(1).optional(),
    oauthScope: z.string().min(1).optional(),
    oauthResource: z.string().min(1).optional(),
  })
  .strict();
const profileDocumentSchema = z
  .object({
    version: z.literal(1),
    activeProfile: z.string().regex(PROFILE_NAME_PATTERN),
    profiles: z.record(z.string().regex(PROFILE_NAME_PATTERN), profileSettingsSchema),
  })
  .strict()
  .superRefine((document, context) => {
    if (!(document.activeProfile in document.profiles)) {
      context.addIssue({
        code: "custom",
        message: "The active profile does not exist.",
        path: ["activeProfile"],
      });
    }
  });

export type ProfileSettings = z.infer<typeof profileSettingsSchema>;
export interface ProfileSummary {
  name: string;
  active: boolean;
  settings: ProfileSettings;
}

interface ProfileDocument {
  version: 1;
  activeProfile: string;
  profiles: Record<string, ProfileSettings>;
}

export interface ProfileStore {
  getActiveName(): Promise<string>;
  get(name: string): Promise<ProfileSettings | undefined>;
  list(): Promise<ProfileSummary[]>;
  set(name: string, settings: ProfileSettings): Promise<void>;
  use(name: string): Promise<void>;
}

export class FileProfileStore implements ProfileStore {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  async getActiveName(): Promise<string> {
    return (await this.#read()).activeProfile;
  }

  async get(name: string): Promise<ProfileSettings | undefined> {
    validateProfileName(name);
    return (await this.#read()).profiles[name];
  }

  async list(): Promise<ProfileSummary[]> {
    const document = await this.#read();
    return Object.entries(document.profiles)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, settings]) => ({
        name,
        active: name === document.activeProfile,
        settings,
      }));
  }

  async set(name: string, settings: ProfileSettings): Promise<void> {
    validateProfileName(name);
    const parsedSettings = profileSettingsSchema.parse(settings);
    const document = await this.#read();
    document.profiles[name] = parsedSettings;
    await this.#write(document);
  }

  async use(name: string): Promise<void> {
    validateProfileName(name);
    const document = await this.#read();
    if (!(name in document.profiles)) {
      throw new Error(`Unknown Dataline profile: ${name}.`);
    }
    document.activeProfile = name;
    await this.#write(document);
  }

  #read(): Promise<ProfileDocument> {
    return readPrivateJson(
      this.#path,
      (value) => profileDocumentSchema.parse(value),
      createDefaultDocument,
    );
  }

  #write(document: ProfileDocument): Promise<void> {
    return writePrivateJson(this.#path, profileDocumentSchema.parse(document));
  }
}

export function validateProfileName(name: string): string {
  const normalized = name.trim();
  if (!PROFILE_NAME_PATTERN.test(normalized)) {
    throw new Error(
      "Profile names must start with an alphanumeric character and contain at most 64 alphanumeric, dot, underscore, or hyphen characters.",
    );
  }
  return normalized;
}

function createDefaultDocument(): ProfileDocument {
  return {
    version: 1,
    activeProfile: "default",
    profiles: { default: {} },
  };
}
