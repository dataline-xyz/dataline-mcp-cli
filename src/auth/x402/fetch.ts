import { ExactEvmScheme, getDefaultAsset } from "@x402/evm";
import {
  wrapFetchWithPaymentFromConfig,
  type PaymentPolicy,
  type PaymentRequirements,
} from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

import { AccessAdapterError } from "../error.js";
import { decimalToAtomic, loadX402Config, type X402Config, type X402Network } from "./config.js";

export interface X402FetchOptions extends X402Config {
  baseUrl: URL;
  fetch?: typeof globalThis.fetch;
}

export function createX402FetchFromEnvironment(
  baseUrl: URL,
  env: NodeJS.ProcessEnv = process.env,
  fetch: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return createX402Fetch({ baseUrl, fetch, ...loadX402Config(env) });
}

export function createX402Fetch(options: X402FetchOptions): typeof globalThis.fetch {
  assertSecureBaseUrl(options.baseUrl);
  const account = privateKeyToAccount(options.privateKey);
  const fetch = bindFetchToBaseUrl(options.fetch ?? globalThis.fetch, options.baseUrl);
  const policy = createDatalinePaymentPolicy(options.network, options.maxPaymentUsd);
  const paymentFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: options.network,
        client: new ExactEvmScheme(account),
      },
    ],
    policies: [policy],
  });

  return async (input, init) => {
    let response: Response;
    try {
      response = await paymentFetch(input, init);
    } catch (error) {
      throw normalizeX402FetchError(error);
    }
    if (response.status !== 402) {
      return response;
    }

    const reason = paymentFailureReason(response);
    await response.body?.cancel();
    throw new AccessAdapterError(
      "x402_payment_rejected",
      reason ? `x402 payment rejected: ${reason}` : "x402 payment was rejected by Dataline.",
      false,
      402,
    );
  };
}

export function createDatalinePaymentPolicy(
  network: X402Network,
  maxPaymentUsd: string,
): PaymentPolicy {
  const asset = getDefaultAsset(network);
  const maxAmount = decimalToAtomic(maxPaymentUsd, asset.decimals);

  return (x402Version, requirements) => {
    if (x402Version !== 2) {
      throw new AccessAdapterError(
        "x402_version_not_allowed",
        "Dataline accepts only x402 protocol version 2.",
        false,
      );
    }

    const allowed = requirements
      .filter((requirement) => isAllowedRequirement(requirement, network, asset.address, maxAmount))
      .sort((left, right) => compareAmounts(left.amount, right.amount));

    if (allowed.length === 0) {
      throw new AccessAdapterError(
        "x402_payment_not_allowed",
        `The payment challenge did not offer exact USDC on ${network} within the ${maxPaymentUsd} USD limit.`,
        false,
      );
    }
    return allowed;
  };
}

function isAllowedRequirement(
  requirement: PaymentRequirements,
  network: X402Network,
  assetAddress: string,
  maxAmount: bigint,
): boolean {
  if (
    requirement.scheme !== "exact" ||
    requirement.network !== network ||
    requirement.asset.toLowerCase() !== assetAddress.toLowerCase()
  ) {
    return false;
  }

  try {
    const amount = BigInt(requirement.amount);
    return amount > 0n && amount <= maxAmount;
  } catch {
    return false;
  }
}

function compareAmounts(left: string, right: string): number {
  const difference = BigInt(left) - BigInt(right);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function bindFetchToBaseUrl(fetch: typeof globalThis.fetch, baseUrl: URL): typeof globalThis.fetch {
  const expectedOrigin = baseUrl.origin;
  const basePath = baseUrl.pathname.replace(/\/+$/, "");

  return async (input, init) => {
    const requestUrl = requestUrlFromInput(input);
    const inBasePath =
      !basePath ||
      requestUrl.pathname === basePath ||
      requestUrl.pathname.startsWith(`${basePath}/`);
    if (requestUrl.origin !== expectedOrigin || !inBasePath) {
      throw new AccessAdapterError(
        "x402_origin_not_allowed",
        "x402 payments are restricted to the configured Dataline Data API base URL.",
        false,
      );
    }
    return fetch(input, { ...init, redirect: "error" });
  };
}

function requestUrlFromInput(input: Parameters<typeof globalThis.fetch>[0]): URL {
  if (input instanceof URL) {
    return input;
  }
  if (typeof input === "string") {
    return new URL(input);
  }
  return new URL(input.url);
}

function assertSecureBaseUrl(baseUrl: URL): void {
  if (baseUrl.protocol !== "https:") {
    throw new Error("x402 mode requires an HTTPS Dataline Data API URL.");
  }
}

function paymentFailureReason(response: Response): string | undefined {
  const encoded =
    response.headers.get("payment-required") ?? response.headers.get("x-payment-required");
  if (!encoded) {
    return undefined;
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as unknown;
    if (!isRecord(decoded) || typeof decoded.error !== "string") {
      return undefined;
    }
    const reason = decoded.error.trim();
    return reason ? reason.slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeX402FetchError(error: unknown): Error {
  if (error instanceof AccessAdapterError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "";
  if (message.includes("Dataline accepts only x402 protocol version 2.")) {
    return new AccessAdapterError(
      "x402_version_not_allowed",
      "Dataline accepts only x402 protocol version 2.",
      false,
    );
  }
  if (message.includes("The payment challenge did not offer exact USDC")) {
    const reason = message.slice(message.indexOf("The payment challenge did not offer exact USDC"));
    return new AccessAdapterError("x402_payment_not_allowed", reason, false);
  }
  if (message.startsWith("Failed to parse payment requirements:")) {
    return new AccessAdapterError(
      "x402_challenge_invalid",
      "Dataline returned an invalid x402 payment challenge.",
      false,
      402,
    );
  }
  if (message.startsWith("Failed to create payment payload:")) {
    return new AccessAdapterError(
      "x402_payment_signing_failed",
      "The x402 client could not create a payment authorization.",
      false,
    );
  }
  if (message === "Payment already attempted") {
    return new AccessAdapterError(
      "x402_payment_already_attempted",
      "The request already contains an x402 payment signature.",
      false,
    );
  }

  return error instanceof Error
    ? error
    : new Error("The x402 payment client failed.", { cause: error });
}
