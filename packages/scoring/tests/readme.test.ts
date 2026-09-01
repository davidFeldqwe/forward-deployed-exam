import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { loadSnapshot, peerGroupSchema } from "@repo/snapshot";

import { queryAirports, scoreUniverse } from "../src/index.ts";
import { rowLookup } from "./rows.ts";

/**
 * Issue #70: this module's README is the page a reviewer reads instead of
 * `percentile.ts`. Its two statements about peer groups — which hub sizes there
 * are, and how many a national ranking sorts into one list — are pinned to the
 * snapshot's own enum, because a page that names four hub sizes above and counts
 * three below leaves a reader looking for the peer group it dropped. `CONTEXT.md`
 * is pinned in `glossary.test.ts` and `DESIGN.md` in `design-doc.test.ts`; only
 * facts that exist in code are checked here, and the prose is the author's.
 */
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

/** The README as one line, so a sentence that wraps still reads as a sentence. */
const prose = readme.replace(/\s+/g, " ");

const scored = scoreUniverse(loadSnapshot());
const row = rowLookup(scored);

/** A small count as this page spells one, indexed by the number it stands for. */
const COUNT_WORDS = ["no", "one", "two", "three", "four", "five"];

test("the README's hub sizes are every one the snapshot accepts", () => {
  const hubSizes = peerGroupSchema.options.join(" / ");
  assert.ok(prose.includes(hubSizes), `the README names the hub sizes as ${hubSizes}`);
});

test("the README counts the peer groups a national ranking sorts, as the schema does", () => {
  const counted = /a national ranking sorts (\w+) peer groups/.exec(prose);
  assert.ok(counted, "the README says how many peer groups a national ranking sorts");
  const hubSizeCount = peerGroupSchema.options.length;
  const spelled = COUNT_WORDS[hubSizeCount];
  assert.ok(spelled, `${hubSizeCount} hub sizes is a count this test knows how to spell`);
  assert.equal(counted[1], spelled);
});

// #73: the illustration is `loadSnapshot()`, so the comment cannot keep the
// four-row top-100 New England cut once the committed file is every primary.
test("the README's New England example is the committed ranking at the default limit", () => {
  const illustrated = /queryAirports\(scored, \{ region: "New England" \}\); \/\/ (.+?) — the national composite, filtered/.exec(
    prose,
  );
  assert.ok(illustrated, "the README comments the rows a New England query returns");
  const newEngland = queryAirports(scored, { region: "New England" });
  assert.equal(
    illustrated[1],
    newEngland.rows
      .map((candidate) => `${candidate.iata} ${candidate.composite} ${candidate.candidateLamp}`)
      .join(", "),
  );
});

test("the README's PVD-over-BOS example uses the committed composites", () => {
  const compared = /small-hub PVD at (\d+) sits above large-hub BOS at (\d+)/.exec(prose);
  assert.ok(compared, "the README names PVD above BOS with their composites");
  const pvd = row("PVD");
  const bos = row("BOS");
  assert.equal(pvd.peerGroup, "small");
  assert.equal(bos.peerGroup, "large");
  assert.equal(compared[1], String(pvd.composite));
  assert.equal(compared[2], String(bos.composite));
});
