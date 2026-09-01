import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CANDIDATE_LAMPS } from "@repo/scoring";

import { LAMP_LEGEND_NOTE, lampBar, lampMarker, lampPill, lampVariable } from "./lamp-hue.ts";

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

test("a map marker lights the same hue its row's lamp does, and missing is not red", () => {
  // The marker takes the row's own lamp, so the two cannot disagree; the map
  // legend prints the words, which is what lets the marker be a dot at all.
  assert.match(lampMarker("Strong candidate"), /lamp-strong/);
  assert.match(lampMarker("Mixed vector"), /lamp-mixed/);
  assert.match(lampMarker("Weak candidate"), /lamp-weak/);

  for (const lamp of ["Partial inputs", "No data"] as const) {
    assert.doesNotMatch(lampMarker(lamp), /lamp-/);
    assert.match(lampMarker(lamp), /muted-foreground/);
  }
});

test("a composite bar lights the same hue its row's lamp does, and missing has no fill", () => {
  assert.match(lampBar("Strong candidate"), /lamp-strong/);
  assert.match(lampBar("Mixed vector"), /lamp-mixed/);
  assert.match(lampBar("Weak candidate"), /lamp-weak/);

  for (const lamp of ["Partial inputs", "No data"] as const) {
    assert.doesNotMatch(lampBar(lamp), /lamp-/);
    assert.match(lampBar(lamp), /fill-transparent/);
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
  const pill = source("components/LampPill.tsx");

  // Mapping the lamp list rather than a hand-written copy is what keeps the key
  // complete and in the same order the rows rank in.
  assert.match(legend, /CANDIDATE_LAMPS\.map/);
  // One chip for this key and the `/map` key alike, and its hue is `lampPill`'s:
  // no key writes a hue class of its own.
  assert.match(pill, /lampPill\(lamp\)/);
  for (const file of [legend, pill, source("components/Skyline.tsx")]) {
    assert.doesNotMatch(file, HUE_CLASS);
  }
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

test("PRD Out of Scope forbids neither in-thread lamp hue nor the map that #68 added", () => {
  const outOfScope = section(prd, "## Out of Scope");

  assert.match(outOfScope, /profit/i);
  assert.doesNotMatch(outOfScope, /lamp|hue/i);
  // #68 amends the "3D map route" lock; what stays out is a basemap token and
  // a second renderer beside the canvas.
  assert.doesNotMatch(outOfScope, /3D map route/);
  assert.match(outOfScope, /Mapbox/);
  assert.match(outOfScope, /SVG twin/i);
});

test("the canvas lights the same custom properties the pills do, and greys the rings", () => {
  // The skyline reads a colour, not a class, so the two surfaces agree by
  // sharing the custom property rather than by matching hex strings.
  assert.equal(lampVariable("Strong candidate"), "--lamp-strong");
  assert.equal(lampVariable("Mixed vector"), "--lamp-mixed");
  assert.equal(lampVariable("Weak candidate"), "--lamp-weak");
  for (const lamp of ["Partial inputs", "No data"] as const) {
    assert.equal(lampVariable(lamp), "--muted-foreground");
  }

  // Each lamp word's pill and its column come off the same token.
  for (const lamp of CANDIDATE_LAMPS) {
    assert.match(lampPill(lamp), new RegExp(lampVariable(lamp).replace("--", "")));
  }
  // That the stylesheet declares each of those properties, in a syntax the
  // canvas can read, is `skyline-scene.test.ts`: one file reads `globals.css`.
});
