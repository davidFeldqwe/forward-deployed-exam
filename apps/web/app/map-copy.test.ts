import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CANDIDATE_LAMPS, MIXED_VECTOR_AT, STRONG_CANDIDATE_AT } from "@repo/scoring";

import { mapCopy } from "./map-copy.ts";
import { INSET_REGIONS } from "./map-insets.ts";

const web = new URL("../", import.meta.url);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

/** The line the key gives one lamp word: its shape, and the band behind it. */
function meaningOf(lamp: string): string {
  const entry = mapCopy.legend.find((line) => line.lamp === lamp);
  assert.ok(entry, lamp);
  return entry.meaning;
}

test("the legend names all five lamp words, so hue never appears without them", () => {
  assert.deepEqual(mapCopy.legend.map((entry) => entry.lamp), [...CANDIDATE_LAMPS]);
  for (const entry of mapCopy.legend) {
    assert.ok(entry.meaning.length > 0, entry.lamp);
  }
});

test("the legend gives each lamp word its shape, and only the two rings a ring", () => {
  for (const lamp of ["Strong candidate", "Mixed vector", "Weak candidate"]) {
    assert.match(meaningOf(lamp), /column/i);
    assert.doesNotMatch(meaningOf(lamp), /ring/i);
  }
  for (const lamp of ["Partial inputs", "No data"]) {
    assert.match(meaningOf(lamp), /ring/i);
    // A ring is missing coverage, not a low composite: never a red column.
    assert.doesNotMatch(meaningOf(lamp), /red|weak|column/i);
  }
});

test("the bands the key names are the scoring module's own thresholds", () => {
  // The lamp is decided in `@repo/scoring`; a key that spelled the numbers out
  // by hand would go on reading 70 after the band moved.
  assert.match(meaningOf("Strong candidate"), new RegExp(`\\b${STRONG_CANDIDATE_AT}\\b`));
  assert.match(meaningOf("Weak candidate"), new RegExp(`\\b${MIXED_VECTOR_AT}\\b`));
  // Mixed closes just under strong: the two bands leave no gap between them.
  assert.match(
    meaningOf("Mixed vector"),
    new RegExp(`${MIXED_VECTOR_AT} to ${STRONG_CANDIDATE_AT - 1}\\b`),
  );
});

test("the page says what height is, and that it is the only thing height is", () => {
  assert.match(mapCopy.encoding, /composite score/i);
  assert.match(mapCopy.encoding, /linear/i);
  // Radius is constant, so the copy does not offer hub size as a second reading.
  assert.match(mapCopy.encoding, /same width|constant/i);
});

test("copy stays inside the glossary", () => {
  const words = [
    mapCopy.title,
    mapCopy.intro,
    mapCopy.encoding,
    mapCopy.insets,
    mapCopy.canvasLabel,
    mapCopy.noWebgl.body,
  ]
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

test("a screen reader is told what the canvas is, since the mesh cannot be read", () => {
  const canvas = source("components/SkylineCanvas.tsx");

  assert.match(mapCopy.canvasLabel, /skyline/i);
  // The label is the copy module's, not a second sentence written in the JSX.
  assert.match(canvas, /role="img"/);
  assert.match(canvas, /aria-label=\{mapCopy\.canvasLabel\}/);
});

test("the key names the corner boxes, and says what clicking one does", () => {
  // A corner of the country is not self-evidently Alaska, and a viewport that
  // answers a click has to say so: there is no cursor on a phone to discover it.
  for (const region of INSET_REGIONS) {
    assert.match(mapCopy.insets, new RegExp(`\\b${region.label}\\b`), region.key);
  }
  assert.match(mapCopy.insets, /click|tap/i);
  // The places are drawn where they are: an inset is a second camera, not a
  // corner an airport was moved into.
  assert.match(mapCopy.insets, /own coordinates|true coordinates/i);
  // And the key is where a visitor reads it, out of the one copy module.
  assert.match(source("components/Skyline.tsx"), /mapCopy\.insets/);
});

test("the map wears the shared bar, with the comparison window years in it", () => {
  const skyline = source("components/Skyline.tsx");

  assert.match(skyline, /<SiteHeader\b/);
  assert.match(skyline, /status=\{<ComparisonWindow/);
  // One home for the window's strings — `site-header.test.ts` pins them — so
  // the surfaces keep no copies of the years.
  assert.doesNotMatch(skyline, /2023|2024/);
});
