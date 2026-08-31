import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

/**
 * Issue #21: the LLM vendor SDK is imported in exactly one module. The scoring
 * package proves its own purity (`packages/scoring/tests/purity.test.ts`); this
 * is the other half — the app may reach an LLM, but only through one door, so a
 * reviewer can read that one file to see the whole boundary.
 */
const web = new URL("../", import.meta.url);
const SOURCE_DIRECTORIES = ["app", "components", "lib"];
const THE_ONE_MODULE = "app/agent-model.ts";

const sources = SOURCE_DIRECTORIES.flatMap((directory) =>
  readdirSync(new URL(`${directory}/`, web), { encoding: "utf8", recursive: true })
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => `${directory}/${file}`),
);

// `import ... from "x"`, `export ... from "x"`, and `import("x")`.
const moduleEdge = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;

function importsOf(file: string): string[] {
  const source = readFileSync(new URL(file, web), "utf8");
  return [...source.matchAll(moduleEdge)].map(([, specifier]) => specifier);
}

const isVendorSdk = (specifier: string) =>
  specifier === "ai" || specifier.startsWith("ai/") || specifier.startsWith("@ai-sdk/");

test("the walk sees the modules it is meant to police", () => {
  assert.ok(sources.includes(THE_ONE_MODULE));
  assert.ok(sources.includes("app/agent-tools.ts"));
  assert.ok(sources.includes("components/Transcript.tsx"));
});

test("exactly one module imports an LLM vendor SDK", () => {
  const importers = sources.filter((file) => importsOf(file).some(isVendorSdk));
  assert.deepEqual(importers, [THE_ONE_MODULE]);
});

test("the tools, the screen and the answer objects need no key to load", () => {
  for (const file of ["app/agent-tools.ts", "app/agent.ts", "app/ranking-view.ts"]) {
    assert.equal(
      importsOf(file).some(isVendorSdk),
      false,
      `${file} must reach the model through ${THE_ONE_MODULE}`,
    );
  }
});
