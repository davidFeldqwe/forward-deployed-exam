import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

// PRD story 43: the screen must not be able to reach an LLM, the network, or
// Convex. The walk is recursive, so a new module cannot dodge it by sitting in a
// subdirectory of `src/`.
const src = new URL("../src/", import.meta.url);
const modules = readdirSync(src, { encoding: "utf8", recursive: true }).filter((file) =>
  file.endsWith(".ts"),
);

function sourceOf(file: string): string {
  return readFileSync(new URL(file, src), "utf8");
}

const FORBIDDEN = [
  "fetch(",
  "xmlhttprequest",
  "websocket",
  "node:http",
  "node:https",
  "node:net",
  "node:fs",
  "undici",
  "axios",
  "convex",
  "anthropic",
  "openai",
  "@ai-sdk",
  "ai/rsc",
  "process.env",
];

test("every scoring module is checked, not a pinned list", () => {
  assert.ok(modules.length >= 5, `found ${modules.length} scoring modules`);
  assert.ok(modules.includes("index.ts"));
});

test("scoring imports neither an LLM, the network, nor Convex", () => {
  for (const file of modules) {
    const source = sourceOf(file).toLowerCase();
    for (const forbidden of FORBIDDEN) {
      assert.equal(
        source.includes(forbidden),
        false,
        `src/${file} must not reference ${forbidden}`,
      );
    }
  }
});

test("the only module scoring reaches outside itself is the snapshot's types", () => {
  // Re-exports count: `export { x } from "convex"` pulls a module in just as an
  // import does, so both keywords are scanned.
  const moduleEdge = /^\s*(?:import|export)\s+(type\s+)?[^"']*from\s+["']([^"']+)["']/gm;
  for (const file of modules) {
    for (const [, isType, specifier] of sourceOf(file).matchAll(moduleEdge)) {
      if (specifier.startsWith("./") || specifier.startsWith("../")) continue;
      assert.equal(specifier, "@repo/snapshot", `src/${file} imports ${specifier}`);
      assert.ok(
        isType,
        `src/${file} imports @repo/snapshot for types only, so nothing loads at runtime`,
      );
    }
  }
});

test("the package declares no LLM or HTTP dependency", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), ["@repo/snapshot"]);
  for (const name of Object.keys(manifest.devDependencies ?? {})) {
    assert.equal(
      /anthropic|openai|ai-sdk|convex|axios|undici|node-fetch/.test(name),
      false,
      `${name} is not a scoring dependency`,
    );
  }
});
