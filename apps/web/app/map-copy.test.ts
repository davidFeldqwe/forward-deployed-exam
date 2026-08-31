import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CANDIDATE_LAMPS } from "@repo/scoring";

import { mapCopy } from "./map-copy.ts";
import { siteHeaderCopy } from "./site-header.ts";

const web = new URL("../", import.meta.url);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

test("the legend names all five lamp words, so hue never appears without them", () => {
  assert.deepEqual(mapCopy.legend.map((entry) => entry.lamp), [...CANDIDATE_LAMPS]);
  for (const entry of mapCopy.legend) {
    assert.ok(entry.meaning.length > 0, entry.lamp);
  }
});

test("the legend gives each lamp word its shape, and only the two rings a ring", () => {
  const shapeOf = (lamp: string): string => {
    const entry = mapCopy.legend.find((line) => line.lamp === lamp);
    assert.ok(entry, lamp);
    return entry.meaning;
  };

  for (const lamp of ["Strong candidate", "Mixed vector", "Weak candidate"]) {
    assert.match(shapeOf(lamp), /column/i);
    assert.doesNotMatch(shapeOf(lamp), /ring/i);
  }
  for (const lamp of ["Partial inputs", "No data"]) {
    assert.match(shapeOf(lamp), /ring/i);
    // A ring is missing coverage, not a low composite: never a red column.
    assert.doesNotMatch(shapeOf(lamp), /red|weak|column/i);
  }
});

test("the page says what height is, and that it is the only thing height is", () => {
  assert.match(mapCopy.encoding, /composite score/i);
  assert.match(mapCopy.encoding, /linear/i);
  // Radius is constant, so the copy does not offer hub size as a second reading.
  assert.match(mapCopy.encoding, /same width|constant/i);
});

test("copy stays inside the glossary", () => {
  const words = [mapCopy.title, mapCopy.intro, mapCopy.encoding, mapCopy.noWebgl.body]
    .concat(mapCopy.legend.map((entry) => entry.meaning))
    .join(" ");

  for (const forbidden of [/traffic light/i, /\bRAG\b/, /\bheat ?map/i, /\brank\b/i]) {
    assert.doesNotMatch(words, forbidden);
  }
});

test("no WebGL is a short empty state that points at the numbers, and invents none", () => {
  const { heading, body } = mapCopy.noWebgl;

  assert.match(heading, /WebGL/);
  // The numbers are still reachable: the same scoring module chat ranks with.
  assert.match(body, /scoreUniverse/);
  // A short empty state, not a second map — and no numbers made up to fill it.
  assert.ok(body.length < 300);
  assert.doesNotMatch(body, /\d/);
});

test("the map wears the shared bar, with the comparison window years in it", () => {
  const skyline = source("components/Skyline.tsx");

  assert.match(skyline, /<SiteHeader\b/);
  assert.match(skyline, /status=\{<ComparisonWindow/);
  // One home for the window's strings: the surfaces do not keep copies.
  assert.match(siteHeaderCopy.comparisonWindowYears, /^2023.2024$/);
  assert.doesNotMatch(skyline, /2023|2024/);
});
