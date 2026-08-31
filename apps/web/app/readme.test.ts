import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { ANTHROPIC_KEY, OPENAI_KEY } from "./agent-provider.ts";

/**
 * Issue #23 / PRD stories 37 and 40: a reviewer clones this repo and follows the
 * README. The checks here are the ones that can rot silently — a command that is
 * no longer a script, a path that moved, a variable nothing reads, a key name the
 * app does not look for — because a reviewer who pastes the wrong secret blames
 * the product, not the paragraph. The prose is the author's.
 */
const repo = new URL("../../../", import.meta.url);
const readme = readFileSync(new URL("README.md", repo), "utf8");

/** A secret by naming convention, whichever one the README happens to name. */
const SECRET_NAME = /\b[A-Z][A-Z0-9_]*(?:_API_KEY|_TOKEN|_SECRET)\b/g;

/** An environment variable as the README writes one: backticked, underscored. */
const DOCUMENTED_VARIABLE = /`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g;

/** A repo file as the README writes one: backticked, with a known extension. */
const DOCUMENTED_PATH = /`([\w./-]+\.(?:ts|tsx|json|yml|md))`/g;

/** The `--filter` target that means the workspace root. */
const ROOT = ".";

type Manifest = { name?: string; scripts?: Record<string, string> };

function manifest(directory: string): Manifest {
  return JSON.parse(readFileSync(new URL(`${directory}package.json`, repo), "utf8")) as Manifest;
}

/** The scripts each package declares, by the name `--filter` takes; root is `.`. */
const scriptsByPackage = new Map<string, string[]>([
  [ROOT, Object.keys(manifest("").scripts ?? {})],
  ...["apps", "packages"]
    .flatMap((group) =>
      readdirSync(new URL(`${group}/`, repo)).map((entry) => manifest(`${group}/${entry}/`)),
    )
    .map((declared): [string, string[]] => [
      declared.name ?? "",
      Object.keys(declared.scripts ?? {}),
    ]),
]);

/** Every `pnpm …` line a reader would copy out of a fenced shell block. */
const pnpmCommands = [...readme.matchAll(/```sh\n([\s\S]*?)```/g)]
  .flatMap(([, block]) => block.split("\n"))
  .map((line) => line.trim())
  .filter((line) => line.startsWith("pnpm "));

/** Every source file a documented variable could be read in, as one haystack. */
const sourceText = [
  "apps/web/app/",
  "apps/web/components/",
  "packages/scoring/src/",
  "packages/snapshot/src/",
  "packages/snapshot/scripts/",
]
  .flatMap((directory) =>
    readdirSync(new URL(directory, repo), { encoding: "utf8", recursive: true })
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
      .map((file) => readFileSync(new URL(`${directory}${file}`, repo), "utf8")),
  )
  .join("\n");

test("every pnpm command the README gives is a script that exists", () => {
  assert.ok(pnpmCommands.length >= 3, `found ${pnpmCommands.length} pnpm commands in the README`);
  for (const command of pnpmCommands) {
    const [, ...words] = command.split(/\s+/);
    if (words[0] === "install") continue;
    const scoped = words[0] === "--filter";
    const target = scoped ? words[1] : ROOT;
    const script = scoped ? words[2] : words[0];
    const scripts = scriptsByPackage.get(target ?? "");
    assert.ok(scripts, `${command} names a workspace package that exists`);
    assert.ok(script !== undefined && scripts.includes(script), `${command} is a script`);
  }
});

test("every repo file the README points a reviewer at is still there", () => {
  const paths = new Set([...readme.matchAll(DOCUMENTED_PATH)].map(([, path]) => path));
  assert.ok(paths.has("DESIGN.md"), "the README points at the design writeup");
  for (const path of paths) {
    assert.ok(existsSync(new URL(path, repo)), `the README names ${path}, which does not exist`);
  }
});

test("the README names the two allowed key names and no third secret", () => {
  const named = [...new Set(readme.match(SECRET_NAME) ?? [])].toSorted();
  assert.deepEqual(named, [ANTHROPIC_KEY, "AUTH_SECRET", OPENAI_KEY].toSorted());
  // PRD story 40: a reviewer must not be able to copy this name out of the page.
  assert.equal(readme.includes("OAUTH_TOKEN"), false, "no OAuth token name in the README");
});

test("every environment variable the README documents is one this repo reads", () => {
  const documented = new Set([...readme.matchAll(DOCUMENTED_VARIABLE)].map(([, name]) => name));
  assert.ok(documented.has(ANTHROPIC_KEY), "the README documents the Anthropic key");
  for (const name of documented) {
    assert.ok(sourceText.includes(name), `${name} is documented but nothing in this repo reads it`);
  }
});
