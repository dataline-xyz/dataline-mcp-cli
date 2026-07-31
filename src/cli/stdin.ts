import type { Readable } from "node:stream";

const MAX_SECRET_BYTES = 16 * 1024;

export async function readSecretFromStdin(input: Readable): Promise<string> {
  if ((input as Readable & { isTTY?: boolean }).isTTY) {
    throw new Error(
      "This command reads the secret from stdin; terminal echo is intentionally unsupported.",
    );
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of input) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    bytes += buffer.byteLength;
    if (bytes > MAX_SECRET_BYTES) {
      throw new Error("Credential input exceeded the safety limit.");
    }
    chunks.push(buffer);
  }

  const secret = Buffer.concat(chunks).toString("utf8").trim();
  if (!secret) {
    throw new Error("Credential input was empty.");
  }
  return secret;
}
