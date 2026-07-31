import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readPrivateJson<T>(
  path: string,
  parse: (value: unknown) => T,
  createDefault: () => T,
): Promise<T> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return createDefault();
    }
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}.`, { cause: error });
  }

  try {
    return parse(value);
  } catch (error) {
    throw new Error(`Invalid Dataline data in ${path}.`, { cause: error });
  }
}

export async function writePrivateJson(path: string, value: unknown): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);

  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
