import { timingSafeEqual } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";

import { AccessAdapterError } from "../error.js";

const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/callback";

export interface OAuthCallbackResult {
  code: string;
}

export interface OAuthLoopbackServer {
  redirectUri: string;
  waitForCallback(): Promise<OAuthCallbackResult>;
  close(): Promise<void>;
}

export interface StartOAuthLoopbackOptions {
  state: string;
  port?: number;
  timeoutMs?: number;
}

export class OAuthLoopbackError extends AccessAdapterError {
  constructor(code: string, message: string) {
    super(code, message, false);
    this.name = "OAuthLoopbackError";
  }
}

export async function startOAuthLoopbackServer(
  options: StartOAuthLoopbackOptions,
): Promise<OAuthLoopbackServer> {
  const state = requireValue(options.state, "OAuth state");
  const timeoutMs = options.timeoutMs ?? 300_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 900_000) {
    throw new Error("OAuth callback timeout must be between 1000 and 900000 milliseconds.");
  }
  const port = options.port ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("OAuth callback port must be an integer from 0 to 65535.");
  }

  let resolveCallback!: (result: OAuthCallbackResult) => void;
  let rejectCallback!: (error: Error) => void;
  const callbackPromise = new Promise<OAuthCallbackResult>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  let settled = false;
  const timer: { value?: NodeJS.Timeout } = {};

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://${CALLBACK_HOST}`);
    if (request.method !== "GET" || requestUrl.pathname !== CALLBACK_PATH) {
      sendHtml(response, 404, "Dataline OAuth callback not found.");
      return;
    }

    const callbackState = singleQueryValue(requestUrl, "state");
    if (!callbackState || !secureEqual(callbackState, state)) {
      sendHtml(response, 400, "The OAuth callback could not be verified.");
      settleError(
        new OAuthLoopbackError(
          "oauth_state_mismatch",
          "The OAuth callback state did not match the login request.",
        ),
      );
      return;
    }

    const oauthError = singleQueryValue(requestUrl, "error");
    if (oauthError) {
      sendHtml(response, 400, "Dataline authorization was not completed.");
      settleError(
        new OAuthLoopbackError(
          `oauth_${sanitizeErrorCode(oauthError)}`,
          "The OAuth authorization server rejected the login request.",
        ),
      );
      return;
    }

    const code = singleQueryValue(requestUrl, "code");
    if (!code) {
      sendHtml(response, 400, "The OAuth callback was incomplete.");
      settleError(
        new OAuthLoopbackError(
          "oauth_callback_invalid",
          "The OAuth callback did not contain one authorization code.",
        ),
      );
      return;
    }

    sendHtml(response, 200, "Dataline is connected. You can close this browser tab.");
    settleSuccess({ code });
  });

  function settleSuccess(result: OAuthCallbackResult): void {
    if (settled) return;
    settled = true;
    if (timer.value) clearTimeout(timer.value);
    resolveCallback(result);
  }

  function settleError(error: Error): void {
    if (settled) return;
    settled = true;
    if (timer.value) clearTimeout(timer.value);
    rejectCallback(error);
  }

  await listen(server, port);
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new OAuthLoopbackError(
      "oauth_callback_bind_failed",
      "The local OAuth callback server did not expose a TCP port.",
    );
  }

  timer.value = setTimeout(() => {
    settleError(
      new OAuthLoopbackError(
        "oauth_callback_timeout",
        "Timed out waiting for the OAuth browser callback.",
      ),
    );
    void closeServer(server);
  }, timeoutMs);

  return {
    redirectUri: `http://${CALLBACK_HOST}:${address.port}${CALLBACK_PATH}`,
    waitForCallback: () => callbackPromise,
    close: async () => {
      clearTimeout(timer.value);
      await closeServer(server);
    },
  };
}

function singleQueryValue(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  return values.length === 1 && values[0] ? values[0] : undefined;
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sendHtml(response: ServerResponse, status: number, message: string): void {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dataline OAuth</title></head><body><main><h1>${message}</h1></main></body></html>`;
  response.writeHead(status, {
    "Cache-Control": "no-store",
    Connection: "close",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "text/html; charset=utf-8",
    Pragma: "no-cache",
  });
  response.end(body);
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(
        new OAuthLoopbackError(
          "oauth_callback_bind_failed",
          `The local OAuth callback server could not bind to ${CALLBACK_HOST}:${port}: ${error.message}`,
        ),
      );
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, CALLBACK_HOST);
  });
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
}

function sanitizeErrorCode(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/gu, "_") || "authorization_rejected"
  );
}

function requireValue(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} cannot be empty.`);
  return normalized;
}
