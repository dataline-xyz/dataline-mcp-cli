export const X402_NETWORKS = ["eip155:84532", "eip155:8453"] as const;
export type X402Network = (typeof X402_NETWORKS)[number];

export const DEFAULT_X402_NETWORK: X402Network = "eip155:84532";
export const DEFAULT_X402_MAX_PAYMENT_USD = "0.001";

export interface X402Config {
  network: X402Network;
  maxPaymentUsd: string;
  privateKey: `0x${string}`;
}

export type X402PolicyConfig = Omit<X402Config, "privateKey">;

export function loadX402PolicyConfig(env: NodeJS.ProcessEnv = process.env): X402PolicyConfig {
  return {
    network: parseX402Network(env.DATALINE_X402_NETWORK),
    maxPaymentUsd: parseMaxPaymentUsd(env.DATALINE_X402_MAX_PAYMENT_USD),
  };
}

export function loadX402Config(env: NodeJS.ProcessEnv = process.env): X402Config {
  return {
    ...loadX402PolicyConfig(env),
    privateKey: parseX402PrivateKey(env.DATALINE_X402_PRIVATE_KEY),
  };
}

export function parseX402Network(value: string | undefined): X402Network {
  const normalized = value?.trim() || DEFAULT_X402_NETWORK;
  if (X402_NETWORKS.some((network) => network === normalized)) {
    return normalized as X402Network;
  }
  throw new Error(
    `Invalid DATALINE_X402_NETWORK: ${JSON.stringify(value)}. Expected one of: ${X402_NETWORKS.join(", ")}.`,
  );
}

export function parseMaxPaymentUsd(value: string | undefined): string {
  const normalized = value?.trim() || DEFAULT_X402_MAX_PAYMENT_USD;
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(normalized) || decimalToAtomic(normalized, 6) <= 0n) {
    throw new Error(
      "DATALINE_X402_MAX_PAYMENT_USD must be a positive decimal with at most 6 decimal places.",
    );
  }
  return normalized;
}

export function decimalToAtomic(value: string, decimals: number): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > decimals) {
    throw new Error(`Cannot represent ${JSON.stringify(value)} with ${decimals} decimals.`);
  }
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0"));
}

export function parseX402PrivateKey(value: string | undefined): `0x${string}` {
  const normalized = value?.trim();
  if (!normalized || !/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("x402 mode requires DATALINE_X402_PRIVATE_KEY as a 32-byte hex private key.");
  }
  return normalized as `0x${string}`;
}
