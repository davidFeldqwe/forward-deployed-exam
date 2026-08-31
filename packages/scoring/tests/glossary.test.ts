import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { loadSnapshot, peerGroupSchema } from "@repo/snapshot";

import { scoreUniverse } from "../src/index.ts";
import { rowLookup } from "./rows.ts";

/**
 * Issue #70 / #68 story 52: `CONTEXT.md` is the vocabulary the product speaks and
 * `DESIGN.md` the writeup a reviewer reads instead of the source. A hub size this
 * module ranks in and the glossary does not name is a word an analyst meets on a
 * row and cannot look up, so both entries are pinned to the snapshot's own enum
 * rather than kept by hand.
 */
const repo = new URL("../../../", import.meta.url);
const context = readFileSync(new URL("CONTEXT.md", repo), "utf8");
const design = readFileSync(new URL("DESIGN.md", repo), "utf8");

/** The four FAA hub sizes, in the order the schema accepts them. */
const HUB_SIZES = peerGroupSchema.options;

/** One glossary entry: its term, the definition, and the words it refuses. */
function glossaryEntry(term: string): string {
  const start = context.indexOf(`**${term}**:`);
  assert.notEqual(start, -1, `CONTEXT.md defines ${term}`);
  const rest = context.slice(start);
  const end = rest.indexOf("\n\n");
  return end === -1 ? rest : rest.slice(0, end);
}

const peerGroup = glossaryEntry("Peer group");

test("the glossary's peer group is every hub size the snapshot accepts", () => {
  assert.deepEqual(HUB_SIZES, ["large", "medium", "small", "nonhub"]);
  for (const hubSize of HUB_SIZES) {
    assert.ok(peerGroup.includes(hubSize), `the entry names ${hubSize}: ${peerGroup}`);
  }
  // The synonyms the entry refuses are still refused, nonhub or not.
  assert.match(peerGroup, /_Avoid_:.*city/);
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
    assert.ok(peerGroup.includes(municipality), `the entry names ${municipality}`);
  }
  assert.notEqual(row("SNA").peerGroup, row("LAX").peerGroup);
});

test("the writeup's peer-group parenthetical is the same list of hub sizes", () => {
  assert.ok(
    design.includes(HUB_SIZES.join(" / ")),
    `DESIGN.md names the hub sizes as ${HUB_SIZES.join(" / ")}`,
  );
});
