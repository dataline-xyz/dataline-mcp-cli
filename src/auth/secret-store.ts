import { z } from "zod";

import { validateProfileName } from "../config/profile-store.js";
import { readPrivateJson, writePrivateJson } from "../storage/private-json.js";

const oauthTokenSetSchema = z
  .object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1).optional(),
    expiresAt: z.number().int().positive(),
    tokenType: z.literal("Bearer"),
    scope: z.array(z.string().min(1)).optional(),
    client: z
      .object({
        issuer: z.url(),
        clientId: z.string().min(1),
        tokenEndpoint: z.url(),
        revocationEndpoint: z.url().optional(),
        resource: z.string().min(1).max(512),
      })
      .strict()
      .optional(),
  })
  .strict();
const profileSecretsSchema = z
  .object({
    apiKey: z.string().min(1).optional(),
    oauth: oauthTokenSetSchema.optional(),
  })
  .strict();
const secretDocumentSchema = z
  .object({
    version: z.literal(1),
    profiles: z.record(z.string(), profileSecretsSchema),
  })
  .strict();

export type OAuthTokenSet = z.infer<typeof oauthTokenSetSchema>;
export type ProfileSecrets = z.infer<typeof profileSecretsSchema>;

interface SecretDocument {
  version: 1;
  profiles: Record<string, ProfileSecrets>;
}

export interface SecretStore {
  get(profile: string): Promise<ProfileSecrets>;
  setApiKey(profile: string, apiKey: string): Promise<void>;
  setOAuth(profile: string, tokens: OAuthTokenSet): Promise<void>;
  clear(profile: string): Promise<void>;
}

export class FileSecretStore implements SecretStore {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  async get(profile: string): Promise<ProfileSecrets> {
    validateProfileName(profile);
    return (await this.#read()).profiles[profile] ?? {};
  }

  async setApiKey(profile: string, apiKey: string): Promise<void> {
    validateProfileName(profile);
    const normalized = requireSecret(apiKey, "API key");
    const document = await this.#read();
    document.profiles[profile] = {
      ...document.profiles[profile],
      apiKey: normalized,
    };
    await this.#write(document);
  }

  async setOAuth(profile: string, tokens: OAuthTokenSet): Promise<void> {
    validateProfileName(profile);
    const document = await this.#read();
    document.profiles[profile] = {
      ...document.profiles[profile],
      oauth: oauthTokenSetSchema.parse(tokens),
    };
    await this.#write(document);
  }

  async clear(profile: string): Promise<void> {
    validateProfileName(profile);
    const document = await this.#read();
    delete document.profiles[profile];
    await this.#write(document);
  }

  #read(): Promise<SecretDocument> {
    return readPrivateJson(
      this.#path,
      (value) => secretDocumentSchema.parse(value),
      () => ({ version: 1, profiles: {} }),
    );
  }

  #write(document: SecretDocument): Promise<void> {
    return writePrivateJson(this.#path, secretDocumentSchema.parse(document));
  }
}

function requireSecret(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} cannot be empty.`);
  }
  return normalized;
}
