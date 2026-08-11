import { randomUUID } from "node:crypto";

import type { CredentialProvider } from "../auth/credentials.js";
import { AccessAdapterError } from "../auth/error.js";
import { DataApiError } from "./error.js";
import type {
  DataApiClient,
  DataApiRequest,
  DataApiResult,
  DataApiWarning,
  QueryParameters,
} from "./types.js";

const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const CLIENT_NAME = "dataline-mcp-cli";

export interface FetchDataApiClientOptions {
  baseUrl: URL;
  credentialProvider: CredentialProvider;
  timeoutMs: number;
  version: string;
  fetch?: typeof globalThis.fetch;
  maxResponseBytes?: number;
}

interface ApiEnvelope {
  code?: unknown;
  msg?: unknown;
  message?: unknown;
  data?: unknown;
}

export class FetchDataApiClient implements DataApiClient {
  readonly #baseUrl: URL;
  readonly #credentialProvider: CredentialProvider;
  readonly #timeoutMs: number;
  readonly #version: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #maxResponseBytes: number;

  constructor(options: FetchDataApiClientOptions) {
    this.#baseUrl = new URL(options.baseUrl);
    this.#credentialProvider = options.credentialProvider;
    this.#timeoutMs = options.timeoutMs;
    this.#version = options.version;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  }

  async get<T>(path: string, query?: QueryParameters): Promise<DataApiResult<T>> {
    return this.#request<T>({ method: "GET", path, ...(query ? { query } : {}) });
  }

  async post<T>(path: string, body: unknown, query?: QueryParameters): Promise<DataApiResult<T>> {
    return this.#request<T>({ method: "POST", path, body, ...(query ? { query } : {}) });
  }

  async #request<T>(request: DataApiRequest): Promise<DataApiResult<T>> {
    const requestId = randomUUID();
    const url = buildUrl(this.#baseUrl, request.path, request.query);
    let body: string | undefined;
    if (request.body !== undefined) {
      body = JSON.stringify(request.body);
    }

    const response = await this.#sendWithAuthRecovery(url, request.method, body, requestId);

    const upstreamRequestId = response.headers.get("x-request-id") ?? requestId;
    const payload = await readJson(response, this.#maxResponseBytes, upstreamRequestId);
    const envelope = asEnvelope(payload);

    if (!response.ok) {
      throw errorFromResponse(response.status, envelope, upstreamRequestId);
    }
    if (!isSuccessCode(envelope.code)) {
      if (hasData(envelope.data)) {
        return {
          data: envelope.data as T,
          warnings: [warningFromEnvelope(envelope)],
          requestId: upstreamRequestId,
        };
      }
      throw errorFromEnvelope(envelope, upstreamRequestId);
    }

    return {
      data: envelope.data as T,
      warnings: [],
      requestId: upstreamRequestId,
    };
  }

  async #sendWithAuthRecovery(
    url: URL,
    method: DataApiRequest["method"],
    body: string | undefined,
    requestId: string,
  ): Promise<Response> {
    let credentialHeaders = await this.#credentialHeaders();
    let response = await this.#send(url, method, body, requestId, credentialHeaders);

    if (response.status !== 401 || !this.#credentialProvider.recoverFromUnauthorized) {
      return response;
    }

    const recovered = await this.#recoverFromUnauthorized(credentialHeaders);
    if (!recovered) {
      return response;
    }

    await response.body?.cancel();
    credentialHeaders = await this.#credentialHeaders();
    response = await this.#send(url, method, body, requestId, credentialHeaders);
    return response;
  }

  async #credentialHeaders(): Promise<Readonly<Record<string, string>>> {
    try {
      return await this.#credentialProvider.getHeaders();
    } catch (error) {
      throw accessAdapterError(error);
    }
  }

  async #recoverFromUnauthorized(
    rejectedHeaders: Readonly<Record<string, string>>,
  ): Promise<boolean> {
    try {
      return await this.#credentialProvider.recoverFromUnauthorized!(rejectedHeaders);
    } catch (error) {
      throw accessAdapterError(error);
    }
  }

  async #send(
    url: URL,
    method: DataApiRequest["method"],
    body: string | undefined,
    requestId: string,
    credentialHeaders: Readonly<Record<string, string>>,
  ): Promise<Response> {
    const headers = new Headers({
      Accept: "application/json",
      "User-Agent": `${CLIENT_NAME}/${this.#version}`,
      "X-Dataline-Client": "local-mcp",
      "X-Request-Id": requestId,
      ...credentialHeaders,
    });
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    try {
      return await this.#fetch(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      if (error instanceof AccessAdapterError) {
        throw new DataApiError({
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          ...(error.status === undefined ? {} : { status: error.status }),
          requestId,
          cause: error,
        });
      }
      const timedOut = isTimeoutError(error);
      throw new DataApiError({
        code: timedOut ? "dataline_api_timeout" : "dataline_api_unreachable",
        message: timedOut
          ? "Dataline Data API did not respond before the request timeout."
          : "Dataline Data API could not be reached.",
        retryable: true,
        requestId,
        cause: error,
      });
    }
  }
}

function accessAdapterError(error: unknown): Error {
  if (error instanceof AccessAdapterError) {
    return new DataApiError({
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.status === undefined ? {} : { status: error.status }),
      cause: error,
    });
  }
  return error instanceof Error ? error : new Error("The access adapter failed.", { cause: error });
}

export function buildUrl(baseUrl: URL, path: string, query?: QueryParameters): URL {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Data API paths must start with exactly one slash.");
  }

  const basePath = baseUrl.pathname.replace(/\/+$/, "");
  const url = new URL(baseUrl);
  url.pathname = `${basePath}${path}`;
  url.search = "";
  url.hash = "";

  if (query) {
    for (const [name, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(name, String(item));
        }
      } else {
        url.searchParams.append(name, String(value));
      }
    }
  }
  return url;
}

async function readJson(response: Response, maxBytes: number, requestId: string): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw responseTooLarge(requestId);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw responseTooLarge(requestId);
  }

  const text = new TextDecoder().decode(buffer);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new DataApiError({
      code: "dataline_api_invalid_json",
      message: "Dataline Data API returned an invalid JSON response.",
      retryable: false,
      status: response.status,
      requestId,
      cause: error,
    });
  }
}

function asEnvelope(payload: unknown): ApiEnvelope {
  if (!isRecord(payload) || !("code" in payload) || !("data" in payload)) {
    throw new DataApiError({
      code: "dataline_api_invalid_envelope",
      message: "Dataline Data API returned an unexpected response envelope.",
      retryable: false,
    });
  }
  return payload;
}

function errorFromResponse(status: number, envelope: ApiEnvelope, requestId: string): DataApiError {
  const code = normalizeCode(envelope.code) ?? `http_${status}`;
  return new DataApiError({
    code: `dataline_api_${code}`,
    message: envelopeMessage(envelope, `Dataline Data API returned HTTP ${status}.`),
    retryable: status === 408 || status === 429 || status >= 500,
    status,
    requestId,
  });
}

function errorFromEnvelope(envelope: ApiEnvelope, requestId: string): DataApiError {
  const code = normalizeCode(envelope.code) ?? "unknown_error";
  return new DataApiError({
    code: `dataline_api_${code}`,
    message: envelopeMessage(envelope, "Dataline Data API returned an error."),
    retryable: false,
    requestId,
  });
}

function warningFromEnvelope(envelope: ApiEnvelope): DataApiWarning {
  const code = normalizeCode(envelope.code) ?? "partial_result";
  return {
    code: `dataline_api_${code}`,
    message: envelopeMessage(envelope, "Dataline Data API returned a partial result."),
    severity: "warning",
  };
}

function responseTooLarge(requestId: string): DataApiError {
  return new DataApiError({
    code: "dataline_api_response_too_large",
    message: "Dataline Data API response exceeded the configured safety limit.",
    retryable: false,
    requestId,
  });
}

function isSuccessCode(value: unknown): boolean {
  return value === 0 || value === "0" || value === "ok";
}

function normalizeCode(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, "_");
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function envelopeMessage(envelope: ApiEnvelope, fallback: string): string {
  for (const value of [envelope.msg, envelope.message]) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function hasData(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}
