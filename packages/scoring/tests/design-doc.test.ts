import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { loadSnapshot } from "@repo/snapshot";

import {
  CANDIDATE_LAMPS,
  COMPONENT_LABELS,
  COMPONENTS,
  MIXED_VECTOR_AT,
  STRONG_CANDIDATE_AT,
  WEIGHTS,
  scoreUniverse,
} from "../src/index.ts";

/**
 * Issue #23 / PRD story 41: `DESIGN.md` is the architecture writeup a reviewer
 * reads instead of the source. It is pinned here, next to the module it
 * describes, because a doc that drifts from the weights or the vintage is worse
 * than no doc: it tells an analyst a number the screen does not use. Only facts
 * that exist in code are checked — the prose is the author's.
 */
const repo = new URL("../../../", import.meta.url);
const design = readFileSync(new URL("DESIGN.md", repo), "utf8");
const snapshot = loadSnapshot();
const scored = scoreUniverse(snapshot);

/** Markdown table rows, as trimmed cells, so a weight can be read off one. */
const tableRows = design
  .split("\n")
  .filter((line) => line.trim().startsWith("|"))
  .map((line) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim()),
  );

function rowStartingWith(label: string): string[] {
  const row = tableRows.find((cells) => cells[0] === label);
  assert.ok(row, `DESIGN.md has a table row for ${label}`);
  return row;
}

/** `| Component | Weight | Raw measure |`, so a component's weight is cell 1. */
const WEIGHT_CELL = 1;

test("the writeup covers the six subjects the exam asks for", () => {
  const headings = [...design.matchAll(/^#+\s+(.+)$/gm)].map(([, text]) => text.toLowerCase());
  for (const subject of ["thesis", "weight", "join", "boundary", "vintage", "gap"]) {
    assert.ok(
      headings.some((heading) => heading.includes(subject)),
      `a heading covers ${subject}; headings are ${headings.join(", ")}`,
    );
  }
});

test("the stated weights are the weights the screen uses", () => {
  const stated = Object.fromEntries(
    COMPONENTS.map((component) => [
      component,
      Number(rowStartingWith(COMPONENT_LABELS[component])[WEIGHT_CELL]),
    ]),
  );
  assert.deepEqual(stated, WEIGHTS);
});

test("the stated candidate-lamp bands are the module's thresholds", () => {
  for (const lamp of CANDIDATE_LAMPS) {
    assert.ok(design.includes(lamp), `DESIGN.md names ${lamp}`);
  }
  // Each band's row has to state the thresholds it sits between, so a reader
  // never has to guess which side of 40 or 70 a composite falls on.
  const bandThresholds: Record<string, number[]> = {
    "Strong candidate": [STRONG_CANDIDATE_AT],
    "Mixed vector": [MIXED_VECTOR_AT, STRONG_CANDIDATE_AT],
    "Weak candidate": [MIXED_VECTOR_AT],
  };
  for (const [lamp, thresholds] of Object.entries(bandThresholds)) {
    const row = rowStartingWith(lamp).join(" ");
    for (const threshold of thresholds) {
      assert.ok(row.includes(`${threshold}`), `the ${lamp} band states ${threshold}`);
    }
  }
});

test("the stated vintage is the committed snapshot's own", () => {
  const { firstYear, secondYear } = snapshot.comparisonWindow;
  assert.ok(design.includes(`${firstYear}`), `DESIGN.md names ${firstYear}`);
  assert.ok(design.includes(`${secondYear}`), `DESIGN.md names ${secondYear}`);
  assert.ok(design.includes(snapshot.asOf.slice(0, 10)), "DESIGN.md names the ingest date");
  assert.ok(
    design.includes(`top ${snapshot.airports.length} US airports`),
    "DESIGN.md names the size of the universe",
  );
});

test("the peer-relative example is the committed snapshot's own numbers", () => {
  // The one worked example in the writeup: two airports whose congestion
  // percentiles are close enough to look comparable and are not.
  for (const iata of ["SNA", "LAX"]) {
    const airport = scored.find((candidate) => candidate.iata === iata);
    assert.ok(airport, `${iata} is in the committed universe`);
    const { percentile } = airport.scoreVector.congestion;
    assert.ok(design.includes(`${percentile}th`), `DESIGN.md states ${iata}'s ${percentile}th`);
    assert.ok(
      design.includes(`${airport.peerGroup}-hub rank`),
      `DESIGN.md calls that a ${airport.peerGroup}-hub rank`,
    );
  }
});

test("the stated join key is the snapshot's, and the doc names what it is not", () => {
  assert.equal(snapshot.joinKey, "iata");
  assert.ok(design.includes("IATA"), "DESIGN.md names the join key");
  assert.ok(design.includes("CityMarketID"), "DESIGN.md names the key it refuses");
});

test("the stated known gaps are the snapshot's own gap list", () => {
  for (const gap of snapshot.gaps) {
    assert.ok(design.includes(gap), `DESIGN.md carries the snapshot's gap: ${gap}`);
  }
});

test("the LLM boundary the doc draws is a file that exists", () => {
  for (const path of [
    "apps/web/app/agent-model.ts",
    "apps/web/app/agent-boundary.test.ts",
    "packages/scoring/tests/purity.test.ts",
  ]) {
    assert.ok(design.includes(path), `DESIGN.md names ${path}`);
    assert.ok(existsSync(new URL(path, repo)), `${path} exists`);
  }
  // PRD story 40, the same rule the README lives under.
  assert.equal(design.includes("OAUTH_TOKEN"), false, "no OAuth token name in DESIGN.md");
});
