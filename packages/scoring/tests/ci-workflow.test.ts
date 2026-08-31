import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Issue #23 / PRD story 39: GitHub Actions proves the screen without a paid LLM
 * key. The workflow is checked here, beside the purity test it runs, because the
 * claim is about scoring: the numbers, the snapshot, and the boundary have to be
 * provable by a job that could not call a model if it wanted to.
 */
const repo = new URL("../../../", import.meta.url);
const workflow = readFileSync(new URL(".github/workflows/ci.yml", repo), "utf8");
const rootManifest = JSON.parse(readFileSync(new URL("package.json", repo), "utf8")) as {
  scripts?: Record<string, string>;
  engines?: { node?: string };
};
const rootScripts = Object.keys(rootManifest.scripts ?? {});

const commands = workflow
  .split("\n")
  .map((line) => line.replace(/^\s*(?:-\s*run:\s*)?/, "").trim())
  .filter((line) => line.startsWith("pnpm "));

test("CI runs on the branches a reviewer would push", () => {
  assert.match(workflow, /^on:$/m);
  assert.match(workflow, /^\s{2}push:$/m);
  assert.match(workflow, /^\s{2}pull_request:$/m);
});

test("CI installs from the lockfile and runs the three quality gates", () => {
  assert.ok(
    commands.some((command) => command.startsWith("pnpm install")),
    "CI installs dependencies",
  );
  for (const gate of ["typecheck", "lint", "test"]) {
    assert.ok(
      commands.includes(`pnpm ${gate}`),
      `CI runs pnpm ${gate}; its commands are ${commands.join(", ")}`,
    );
  }
});

test("every pnpm command CI runs is a root script", () => {
  for (const command of commands) {
    const [script] = command.split(/\s+/).slice(1);
    if (script === "install") continue;
    assert.ok(script !== undefined && rootScripts.includes(script), `${command} is a root script`);
  }
});

test("no secret reaches the job, so the run cannot spend a token", () => {
  assert.equal(
    workflow.includes("secrets."),
    false,
    "the workflow passes no repository secret to any step",
  );
  assert.equal(workflow.includes("OAUTH_TOKEN"), false, "no OAuth token name in CI");
  // A key must not be handed to a step as `env:` or to an action as `with:`
  // either: the guard step names these two, without a colon, to refuse them.
  for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
    assert.ok(workflow.includes(key), `CI names ${key} in the step that refuses it`);
    assert.equal(workflow.includes(`${key}:`), false, `${key} is not set for any step`);
  }
});

test("CI runs the Node version this repo is pinned to", () => {
  const major = rootManifest.engines?.node?.match(/^(\d+)/)?.[1];
  assert.ok(major, "the root manifest pins a Node major");
  assert.match(workflow, new RegExp(`node-version:\\s*(["']?)${major}(\\.x)?\\1\\s*$`, "m"));
});
