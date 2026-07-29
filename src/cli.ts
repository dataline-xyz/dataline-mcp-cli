#!/usr/bin/env node

import { createCli } from "./cli/program.js";

async function main(): Promise<void> {
  const program = createCli();

  if (process.argv.length <= 2) {
    program.outputHelp();
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`dataline: ${message}\n`);
  process.exitCode = 1;
});
