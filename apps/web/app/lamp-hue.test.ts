import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CANDIDATE_LAMPS } from "@repo/scoring";

import { LAMP_LEGEND, LAMP_LEGEND_NOTE, LAMP_PILL } from "./lamp-hue.ts";
import { lampTone } from "./ranking-view.ts";

test("every lamp word has a tone, and only the scored three take a hue", () => {
  assert.deepEqual(
    CANDIDATE_LAMPS.map(lampTone),
    ["strong", "mixed", "weak", "none", "none"],
  );
});

test("the legend names all five lamp words, in ranking order", () => {
  assert.deepEqual(
    LAMP_LEGEND.map((entry) => entry.lamp),
    [...CANDIDATE_LAMPS],
  );
  // The legend is the same mapping the rows draw with, so a row and its key
  // cannot disagree about which hue a lamp word gets.
  for (const entry of LAMP_LEGEND) {
    assert.equal(entry.pill, LAMP_PILL[entry.tone]);
  }
});

test("Strong is green, Mixed is yellow, Weak is red — three distinct hues", () => {
  assert.match(LAMP_PILL.strong, /lamp-strong/);
  assert.match(LAMP_PILL.mixed, /lamp-mixed/);
  assert.match(LAMP_PILL.weak, /lamp-weak/);
  assert.equal(new Set([LAMP_PILL.strong, LAMP_PILL.mixed, LAMP_PILL.weak]).size, 3);
});

test("Partial inputs and No data are grey or outline, and never red", () => {
  const coverage = LAMP_LEGEND.filter((entry) => entry.tone === "none");

  assert.deepEqual(
    coverage.map((entry) => entry.lamp),
    ["Partial inputs", "No data"],
  );
  for (const entry of coverage) {
    assert.doesNotMatch(entry.pill, /lamp-(?:strong|mixed|weak)/);
    assert.match(entry.pill, /muted-foreground/);
  }
});

test("the legend note explains hue as a companion to the words, in glossary terms", () => {
  assert.match(LAMP_LEGEND_NOTE, /never/i);
  for (const forbidden of [/traffic light/i, /\bRAG\b/, /\bgrade\b/i]) {
    assert.doesNotMatch(LAMP_LEGEND_NOTE, forbidden);
  }
});

const web = new URL("../", import.meta.url);
const ranking = readFileSync(new URL("components/answers/Ranking.tsx", web), "utf8");

test("the ranking table takes its hue from one map, so a bar cannot pick one up", () => {
  assert.match(ranking, /LAMP_PILL/);
  // Percentile bars inside the score vector stay grey: no hue class is written
  // anywhere in the table itself.
  assert.doesNotMatch(ranking, /(?:text|bg|border)-lamp-/);
  assert.match(ranking, /bg-muted-foreground/);
});

const repo = new URL("../../", web);

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const rest = markdown.slice(start + heading.length);
  const end = rest.search(/\n#{2,3} /);
  return end === -1 ? rest : rest.slice(0, end);
}

test("the glossary allows hue on the ranking table beside the lamp words", () => {
  const lamp = section(readFileSync(new URL("CONTEXT.md", repo), "utf8"), "**Candidate lamp**");

  assert.match(lamp, /green/i);
  assert.match(lamp, /yellow/i);
  assert.match(lamp, /red/i);
  assert.match(lamp, /grey|outline/i);
  assert.match(lamp, /ranking table/i);
  assert.match(lamp, /never red/i);
  // Hues are allowed; the names for them are still not product copy.
  assert.match(lamp, /_Avoid_:.*traffic light/);
  assert.match(lamp, /_Avoid_:.*RAG/);
});

test("the PRD assigns the five hues and keeps the percentile bars grey", () => {
  const prd = readFileSync(new URL("PRD.md", repo), "utf8");
  const lamp = section(prd, "**Candidate lamp** (from the locked prototype):");

  assert.match(lamp, /green/i);
  assert.match(lamp, /yellow/i);
  assert.match(lamp, /red/i);
  assert.match(lamp, /grey|outline/i);
  assert.match(lamp, /legend/i);
  assert.match(prd, /percentile bars grey/);
});

test("PRD Out of Scope no longer forbids in-thread lamp hue, and still forbids 3D map", () => {
  const outOfScope = section(readFileSync(new URL("PRD.md", repo), "utf8"), "## Out of Scope");

  assert.match(outOfScope, /3D map/);
  assert.match(outOfScope, /profit/i);
  assert.doesNotMatch(outOfScope, /lamp|hue/i);
});
