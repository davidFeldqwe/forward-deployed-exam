import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CANDIDATE_LAMPS } from "@repo/scoring";

import { LAMP_LEGEND_NOTE, lampPill } from "./lamp-hue.ts";

const HUE_CLASS = /(?:text|bg|border)-lamp-/;

test("Strong is green, Mixed is yellow, Weak is red — three distinct hues", () => {
  assert.match(lampPill("Strong candidate"), /lamp-strong/);
  assert.match(lampPill("Mixed vector"), /lamp-mixed/);
  assert.match(lampPill("Weak candidate"), /lamp-weak/);

  const scored = ["Strong candidate", "Mixed vector", "Weak candidate"] as const;
  assert.equal(new Set(scored.map(lampPill)).size, 3);
});

test("Partial inputs and No data are grey or outline, and never red", () => {
  for (const lamp of ["Partial inputs", "No data"] as const) {
    assert.doesNotMatch(lampPill(lamp), HUE_CLASS);
    assert.match(lampPill(lamp), /muted-foreground/);
  }
});

test("every lamp word has a pill, so no row can print words with no pill", () => {
  for (const lamp of CANDIDATE_LAMPS) {
    assert.match(lampPill(lamp), /border/);
  }
});

test("the legend note explains hue as a companion to the words, in glossary terms", () => {
  assert.match(LAMP_LEGEND_NOTE, /never/i);
  for (const forbidden of [/traffic light/i, /\bRAG\b/, /\bgrade\b/i]) {
    assert.doesNotMatch(LAMP_LEGEND_NOTE, forbidden);
  }
});

const web = new URL("../", import.meta.url);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

test("the ranking table takes its hue from `lampPill`, so a bar cannot pick one up", () => {
  const ranking = source("components/answers/Ranking.tsx");

  assert.match(ranking, /lampPill\(row\.lamp\)/);
  // Percentile bars inside the score vector stay grey: no hue class is written
  // anywhere in the table itself.
  assert.doesNotMatch(ranking, HUE_CLASS);
  assert.match(ranking, /bg-muted-foreground/);
});

test("the legend names every lamp word, in ranking order, with the rows' own pills", () => {
  const legend = source("components/answers/LampLegend.tsx");

  // Mapping the lamp list rather than a hand-written copy is what keeps the key
  // complete and in the same order the rows rank in.
  assert.match(legend, /CANDIDATE_LAMPS\.map/);
  assert.match(legend, /lampPill\(lamp\)/);
  assert.doesNotMatch(legend, HUE_CLASS);
});

const repo = new URL("../../", web);

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const rest = markdown.slice(start + heading.length);
  const end = rest.search(/\n#{2,3} /);
  return end === -1 ? rest : rest.slice(0, end);
}

const context = readFileSync(new URL("CONTEXT.md", repo), "utf8");
const prd = readFileSync(new URL("PRD.md", repo), "utf8");

/** The five hues the lamp words carry, as the docs have to hand them out. */
function assertNamesEveryHue(text: string): void {
  for (const hue of [/green/i, /yellow/i, /red/i, /grey|outline/i]) {
    assert.match(text, hue);
  }
}

test("the glossary allows hue on the ranking table beside the lamp words", () => {
  const lamp = section(context, "**Candidate lamp**");

  assertNamesEveryHue(lamp);
  assert.match(lamp, /ranking table/i);
  assert.match(lamp, /never red/i);
  // Hues are allowed; the names for them are still not product copy.
  assert.match(lamp, /_Avoid_:.*traffic light/);
  assert.match(lamp, /_Avoid_:.*RAG/);
});

test("the PRD assigns the five hues and keeps the percentile bars grey", () => {
  const lamp = section(prd, "**Candidate lamp** (from the locked prototype):");

  assertNamesEveryHue(lamp);
  assert.match(lamp, /legend/i);
  assert.match(prd, /percentile bars grey/);
});

test("PRD Out of Scope no longer forbids in-thread lamp hue, and still forbids 3D map", () => {
  const outOfScope = section(prd, "## Out of Scope");

  assert.match(outOfScope, /3D map/);
  assert.match(outOfScope, /profit/i);
  assert.doesNotMatch(outOfScope, /lamp|hue/i);
});
