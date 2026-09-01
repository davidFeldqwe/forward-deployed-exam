/**
 * Local Evalite runner for the New England ranking. Not wired to `pnpm test`
 * or turbo: a reviewer with a vendor key invokes this script. Without a key
 * the suite skips so a fresh clone and GitHub Actions stay green.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ANTHROPIC_KEY, OPENAI_KEY, chooseProvider } from "../app/agent-provider.ts";
import { runNewEnglandEval } from "./new-england.eval.ts";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const traceDir = join(webRoot, ".evalite");

void main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  loadEnvFile(join(webRoot, ".env.local"));

  if (!chooseProvider(process.env)) {
    process.stdout.write(
      `Skipping Evalite: no ${ANTHROPIC_KEY} or ${OPENAI_KEY}. CI and a fresh clone stay key-free.\n`,
    );
    return;
  }

  const result = await runNewEnglandEval();
  mkdirSync(traceDir, { recursive: true });
  writeFileSync(
    join(traceDir, "new-england.json"),
    `${JSON.stringify({ at: new Date().toISOString(), ...result }, null, 2)}\n`,
  );

  if (!result.verdict.ok) {
    process.stderr.write(`Evalite failed: ${result.verdict.reason}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Evalite passed: ${result.verdict.reason}\n`);
}

/** Fill unset keys from Next's local env file; never override a shell value. */
function loadEnvFile(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const name = line.slice(0, eq).trim();
    const value = unquote(line.slice(eq + 1).trim());
    if (process.env[name] === undefined) {
      process.env[name] = value;
    }
  }
}

function unquote(value: string): string {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  return value;
}
