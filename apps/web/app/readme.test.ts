import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { ANTHROPIC_KEY, OPENAI_KEY } from "./agent-provider.ts";

/**
 * Issue #23 / PRD stories 37 and 40: a reviewer clones this repo and follows the
 * README. The checks here are the ones that can rot silently — a command that is
 * no longer a script, a variable nothing reads, a key name the app does not look
 * for — because a reviewer who pastes the wrong secret blames the product, not
 * the paragraph.
 */
const repo = new URL("../../../", import.meta.url);
const readme = readFileSync(new URL("README.md", repo), "utf8");

/** Every workspace manifest, by package name, so a command can be resolved. */
const manifests = new Map(
  ["apps", "packages"]
    .flatMap((group) =>
      readdirSync(new URL(`${group}/`, repo)).map((entry) => `${group}/${entry}/package.json`),
    )
    .map((path) => {
      const manifest = JSON.parse(readFileSync(new URL(path, repo), "utf8")) as {
        name: string;
        scripts?: Record<string, string>;
      };
      return [manifest.name, manifest] as const;
    }),
);

const rootManifest = JSON.parse(readFileSync(new URL("package.json", repo), "utf8")) as {
  scripts?: Record<string, string>;
};

function shellLines(): string[] {
  return [...readme.matchAll(/```sh\n([\s\S]*?)```/g)]
    .flatMap(([, block]) => block.split("\n"))
    .map((line) => line.trim())
    .filter((line) => line.startsWith("pnpm "));
}

test("every pnpm command the README gives is a script that exists", () => {
  const commands = shellLines();
  assert.ok(commands.length >= 3, `found ${commands.length} pnpm commands in the README`);
  for (const command of commands) {
    const words = command.split(/\s+/).slice(1);
    if (words[0] === "install") continue;
    const [filter, packageName, ...rest] = words;
    if (filter === "--filter") {
      const manifest = manifests.get(packageName ?? "");
      assert.ok(manifest, `${command} names a workspace package that exists`);
      assert.ok(rest[0] !== undefined && rest[0] in (manifest.scripts ?? {}), `${command} is a script`);
      continue;
    }
    assert.ok(words[0] !== undefined && words[0] in (rootManifest.scripts ?? {}), `${command} is a root script`);
  }
});

test("the README names the two allowed key names and no third secret", () => {
  const secrets = [...new Set(readme.match(/\b[A-Z][A-Z0-9_]*(?:_API_KEY|_TOKEN|_SECRET)\b/g) ?? [])];
  assert.deepEqual(secrets.toSorted(), [ANTHROPIC_KEY, "AUTH_SECRET", OPENAI_KEY].toSorted());
  // PRD story 40: a reviewer must not be able to copy this name out of the README.
  assert.equal(readme.includes("OAUTH_TOKEN"), false, "no OAuth token name in the README");
});

test("every environment variable the README documents is one this repo reads", () => {
  const sources = [
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
  const documented = [
    ...new Set(
      [...readme.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g)].map(([, name]) => name as string),
    ),
  ];
  assert.ok(documented.includes(ANTHROPIC_KEY), "the README documents the Anthropic key");
  for (const name of documented) {
    assert.ok(sources.includes(name), `${name} is documented but nothing in this repo reads it`);
  }
});
