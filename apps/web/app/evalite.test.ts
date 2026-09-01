import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ANTHROPIC_KEY, OPENAI_KEY } from "./agent-provider.ts";

const web = new URL("../", import.meta.url);
const repo = new URL("../../../", import.meta.url);

type Manifest = { scripts?: Record<string, string> };

const webManifest = JSON.parse(readFileSync(new URL("package.json", web), "utf8")) as Manifest;
const rootManifest = JSON.parse(readFileSync(new URL("package.json", repo), "utf8")) as Manifest;
const turbo = JSON.parse(readFileSync(new URL("turbo.json", repo), "utf8")) as {
  tasks?: Record<string, unknown>;
};
const gitignore = readFileSync(new URL(".gitignore", repo), "utf8");
const workflow = readFileSync(new URL(".github/workflows/ci.yml", repo), "utf8");
const evalScript = readFileSync(new URL("evals/run.ts", web), "utf8");
const evalCases = [
  readFileSync(new URL("evals/new-england.eval.ts", web), "utf8"),
  readFileSync(new URL("evals/compare.eval.ts", web), "utf8"),
  readFileSync(new URL("evals/roi.eval.ts", web), "utf8"),
  readFileSync(new URL("evals/paris.eval.ts", web), "utf8"),
].join("\n");

test("Evalite is a dedicated eval script, not turbo or pnpm test", () => {
  assert.ok(webManifest.scripts?.eval, "apps/web declares an eval script");
  assert.match(webManifest.scripts.eval, /evals\/run\.ts/);
  assert.equal(webManifest.scripts.test?.includes("eval"), false);
  assert.equal(rootManifest.scripts?.test, "turbo run test");
  assert.equal(Object.hasOwn(turbo.tasks ?? {}, "eval"), false);
  assert.doesNotMatch(workflow, /\beval\b/);
});

test("eval traces stay out of git", () => {
  assert.match(gitignore, /^\.evalite\/?$/m);
});

test("the eval suite drives answerQuestion on the real agent loop", () => {
  assert.match(evalCases, /answerQuestion/);
  assert.match(evalCases, /streamAgentModel/);
  assert.match(evalCases, /New England/);
  assert.match(evalCases, /checkNewEnglandRanking/);
  assert.match(evalCases, /checkCompareCongestion/);
  assert.match(evalCases, /checkOffThesisRefusal/);
  assert.match(evalCases, /checkParisRefusal/);
  assert.match(evalScript, /chooseProvider/);
  assert.match(evalScript, /ANTHROPIC_KEY|OPENAI_KEY/);
  assert.match(evalScript, /runCompareEval/);
  assert.match(evalScript, /runRoiEval/);
  assert.match(evalScript, /runParisEval/);
});

test("a missing LLM key skips the eval suite instead of failing", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", fileURLToPath(new URL("evals/run.ts", web))],
    {
      cwd: fileURLToPath(web),
      encoding: "utf8",
      env: {
        ...process.env,
        [ANTHROPIC_KEY]: "",
        [OPENAI_KEY]: "",
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(`${result.stdout}${result.stderr}`, /skip/i);
});
