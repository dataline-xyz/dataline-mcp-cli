export const DEFAULT_OAUTH_ISSUER = "https://control-api.dataline.xyz";
export const DEFAULT_OAUTH_SCOPE = "data.*.read";

export interface OAuthRuntimeConfig {
  issuer: URL;
  scope: string;
  resource: string;
}

export function loadOAuthRuntimeConfig(
  dataApiUrl: URL,
  env: NodeJS.ProcessEnv = process.env,
): OAuthRuntimeConfig {
  return {
    issuer: parseOAuthIssuer(env.DATALINE_OAUTH_ISSUER),
    scope: parseOAuthScope(env.DATALINE_OAUTH_SCOPE),
    resource: parseOAuthResource(
      env.DATALINE_OAUTH_RESOURCE ?? normalizedDataApiResource(dataApiUrl),
    ),
  };
}

export function parseOAuthIssuer(value: string | undefined): URL {
  const issuer = parseAbsoluteUrl(value?.trim() || DEFAULT_OAUTH_ISSUER, "OAuth issuer");
  if (issuer.search || issuer.hash) {
    throw new Error("DATALINE_OAUTH_ISSUER cannot contain a query string or fragment.");
  }
  if (issuer.protocol !== "https:" && !isLocalDevelopmentUrl(issuer)) {
    throw new Error(
      "DATALINE_OAUTH_ISSUER must use HTTPS unless it targets loopback, localhost, or a .test host.",
    );
  }
  issuer.pathname = issuer.pathname.replace(/\/+$/, "");
  return issuer;
}

export function parseOAuthScope(value: string | undefined): string {
  const scope = value?.trim() || DEFAULT_OAUTH_SCOPE;
  if (scope.length > 500 || hasAsciiControlCharacter(scope)) {
    throw new Error(
      "DATALINE_OAUTH_SCOPE must be a valid OAuth scope string up to 500 characters.",
    );
  }
  const values = scope.split(/\s+/u).filter(Boolean);
  if (values.length === 0 || new Set(values).size !== values.length) {
    throw new Error("DATALINE_OAUTH_SCOPE must contain unique, non-empty scope values.");
  }
  return values.join(" ");
}

export function parseOAuthResource(value: string): string {
  const resource = value.trim();
  if (!resource || resource.length > 512 || hasAsciiControlCharacter(resource)) {
    throw new Error("DATALINE_OAUTH_RESOURCE must be between 1 and 512 valid characters.");
  }
  const url = parseAbsoluteUrl(resource, "OAuth resource");
  if (url.protocol !== "https:" && !isLocalDevelopmentUrl(url)) {
    throw new Error(
      "DATALINE_OAUTH_RESOURCE must use HTTPS unless it targets loopback, localhost, or a .test host.",
    );
  }
  if (url.hash) {
    throw new Error("DATALINE_OAUTH_RESOURCE cannot contain a fragment.");
  }
  return resource.replace(/\/+$/, "");
}

function normalizedDataApiResource(dataApiUrl: URL): string {
  return dataApiUrl.toString().replace(/\/+$/, "");
}

function parseAbsoluteUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL.`);
  }
  if (!url.hostname || url.username || url.password) {
    throw new Error(`${label} must be an absolute URL without user information.`);
  }
  return url;
}

function isLocalDevelopmentUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return (
    url.protocol === "http:" &&
    (hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "localhost" ||
      hostname.endsWith(".test"))
  );
}

function hasAsciiControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}
