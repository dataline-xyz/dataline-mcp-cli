import { CredentialUnavailableError } from "../credentials.js";
import type { OAuthTokenSet, SecretStore } from "../secret-store.js";
import type { OAuthTokenClient } from "./token-client.js";

const DEFAULT_EXPIRY_SKEW_MS = 60_000;

export interface OAuthTokenManagerOptions {
  profileName: string;
  secretStore: SecretStore;
  tokenClient?: OAuthTokenClient;
  now?: () => number;
  expirySkewMs?: number;
}

export class OAuthTokenManager {
  readonly #profileName: string;
  readonly #secretStore: SecretStore;
  readonly #tokenClient: OAuthTokenClient | undefined;
  readonly #now: () => number;
  readonly #expirySkewMs: number;
  #refreshPromise: Promise<OAuthTokenSet> | undefined;

  constructor(options: OAuthTokenManagerOptions) {
    this.#profileName = options.profileName;
    this.#secretStore = options.secretStore;
    this.#tokenClient = options.tokenClient;
    this.#now = options.now ?? Date.now;
    this.#expirySkewMs = options.expirySkewMs ?? DEFAULT_EXPIRY_SKEW_MS;
  }

  async getAccessToken(): Promise<string> {
    const tokens = await this.#readTokens();
    if (tokens.expiresAt > this.#now() + this.#expirySkewMs) {
      return tokens.accessToken;
    }
    return (await this.#refresh(tokens)).accessToken;
  }

  async recoverFromUnauthorized(rejectedAccessToken: string): Promise<boolean> {
    const tokens = await this.#readTokens();
    if (tokens.accessToken !== rejectedAccessToken) {
      return true;
    }
    if (!tokens.refreshToken || !this.#tokenClient) {
      return false;
    }
    await this.#refresh(tokens);
    return true;
  }

  async #readTokens(): Promise<OAuthTokenSet> {
    const tokens = (await this.#secretStore.get(this.#profileName)).oauth;
    if (!tokens) {
      throw new CredentialUnavailableError(
        "oauth_token_missing",
        "OAuth mode requires a Dataline login or DATALINE_ACCESS_TOKEN.",
      );
    }
    return tokens;
  }

  #refresh(tokens: OAuthTokenSet): Promise<OAuthTokenSet> {
    if (this.#refreshPromise) {
      return this.#refreshPromise;
    }
    if (!tokens.refreshToken) {
      throw new CredentialUnavailableError(
        "oauth_refresh_token_missing",
        "The OAuth session expired and cannot be refreshed. Run `dataline auth login` again.",
      );
    }
    if (!this.#tokenClient) {
      throw new CredentialUnavailableError(
        "oauth_refresh_unavailable",
        "The OAuth session expired, but this build does not have a configured token endpoint.",
      );
    }

    this.#refreshPromise = this.#performRefresh(tokens).finally(() => {
      this.#refreshPromise = undefined;
    });
    return this.#refreshPromise;
  }

  async #performRefresh(tokens: OAuthTokenSet): Promise<OAuthTokenSet> {
    const refreshed = await this.#tokenClient!.refresh(tokens.refreshToken!);
    const nextTokens: OAuthTokenSet = {
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
      tokenType: "Bearer",
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
      ...(refreshed.scope
        ? { scope: refreshed.scope }
        : tokens.scope
          ? { scope: tokens.scope }
          : {}),
    };
    await this.#secretStore.setOAuth(this.#profileName, nextTokens);
    return nextTokens;
  }
}
