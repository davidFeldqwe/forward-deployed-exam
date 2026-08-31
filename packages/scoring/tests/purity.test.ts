import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

// PRD story 43: the screen must not be able to reach an LLM, the network, or
// Convex. This test reads every runtime module, so adding a file cannot dodge it.
const src = new URL("../src/", import.meta.url);
const modules = readdirSync(src).filter((file) => file.endsWith(".ts"));

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
    const source = readFileSync(new URL(file, src), "utf8").toLowerCase();
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
  const importLine = /^\s*import\s+(type\s+)?[^"']*from\s+["']([^"']+)["']/gm;
  for (const file of modules) {
    const source = readFileSync(new URL(file, src), "utf8");
    for (const [, isType, specifier] of source.matchAll(importLine)) {
      if (specifier.startsWith("./") || specifier.startsWith("../")) continue;
      assert.equal(specifier, "@repo/snapshot", `src/${file} imports ${specifier}`);
      assert.ok(isType, `src/${file} imports @repo/snapshot for types only, so nothing loads at runtime`);
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
