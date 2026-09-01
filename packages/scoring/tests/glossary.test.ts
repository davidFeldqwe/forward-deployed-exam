import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { loadSnapshot, peerGroupSchema } from "@repo/snapshot";

import { scoreUniverse } from "../src/index.ts";
import { rowLookup } from "./rows.ts";

/**
 * Issue #70 / #68 story 52: `CONTEXT.md` is the vocabulary the product speaks. A
 * hub size this module ranks in and the glossary does not name is a word an
 * analyst meets on a row and cannot look up, so the entry is pinned to the
 * snapshot's own enum rather than kept by hand. The same list in `DESIGN.md` is
 * pinned beside the writeup's other facts, in `design-doc.test.ts`.
 */
const repo = new URL("../../../", import.meta.url);
const context = readFileSync(new URL("CONTEXT.md", repo), "utf8");

/** One glossary entry: its term, the definition, and the words it refuses. */
function glossaryEntry(term: string): string {
  const start = context.indexOf(`**${term}**:`);
  assert.notEqual(start, -1, `CONTEXT.md defines ${term}`);
  const rest = context.slice(start);
  const end = rest.indexOf("\n\n");
  return end === -1 ? rest : rest.slice(0, end);
}

const peerGroupEntry = glossaryEntry("Peer group");

test("the glossary's peer group is every hub size the snapshot accepts", () => {
  for (const hubSize of peerGroupSchema.options) {
    assert.ok(peerGroupEntry.includes(hubSize), `the entry names ${hubSize}: ${peerGroupEntry}`);
  }
  // The synonyms the entry refuses are still refused, nonhub or not.
  assert.match(peerGroupEntry, /_Avoid_:.*city/);
});

// The example is what makes the entry a rule rather than a definition: two
// airports in one metro area that the screen never ranks against each other.
test("the glossary's Santa Ana versus Los Angeles example is the committed snapshot's", () => {
  const row = rowLookup(scoreUniverse(loadSnapshot()));
  for (const { iata, municipality } of [
    { iata: "SNA", municipality: "Santa Ana" },
    { iata: "LAX", municipality: "Los Angeles" },
  ]) {
    assert.equal(row(iata).municipality, municipality);
    assert.ok(peerGroupEntry.includes(municipality), `the entry names ${municipality}`);
  }
  assert.notEqual(row("SNA").peerGroup, row("LAX").peerGroup);
});
