export const AUTH_MODES = ["oauth", "api_key", "x402"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

export const DEFAULT_AUTH_MODE: AuthMode = "oauth";
export const DEFAULT_DATA_API_URL = "https://data-api.dataline.xyz";
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const DATALINE_ACCESS_MODE_HEADER = "X-Dataline-Access-Mode";

export interface RuntimeConfig {
  authMode: AuthMode;
  dataApiUrl: URL;
  requestTimeoutMs: number;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    authMode: parseAuthMode(env.DATALINE_AUTH_MODE),
    dataApiUrl: parseDataApiUrl(env.DATALINE_DATA_API_URL),
    requestTimeoutMs: parseRequestTimeoutMs(env.DATALINE_REQUEST_TIMEOUT_MS),
  };
}

export function parseAuthMode(value: string | undefined): AuthMode {
  const normalized = value?.trim().toLowerCase() || DEFAULT_AUTH_MODE;
  if (AUTH_MODES.some((mode) => mode === normalized)) {
    return normalized as AuthMode;
  }

  throw new Error(
    `Invalid DATALINE_AUTH_MODE: ${JSON.stringify(value)}. Expected one of: ${AUTH_MODES.join(", ")}.`,
  );
}

export function parseDataApiUrl(value: string | undefined): URL {
  const raw = value?.trim() || DEFAULT_DATA_API_URL;
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid DATALINE_DATA_API_URL: ${JSON.stringify(value)}.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("DATALINE_DATA_API_URL must use http or https.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

export function parseRequestTimeoutMs(value: string | undefined): number {
  const raw = value?.trim();
  if (!raw) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  const timeout = Number(raw);
  if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 300_000) {
    throw new Error("DATALINE_REQUEST_TIMEOUT_MS must be an integer from 100 to 300000.");
  }

  return timeout;
}

export function buildAccessModeHeaders(authMode: AuthMode): Readonly<Record<string, string>> {
  return authMode === "x402" ? { [DATALINE_ACCESS_MODE_HEADER]: "x402" } : {};
}
