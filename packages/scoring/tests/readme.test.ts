import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { peerGroupSchema } from "@repo/snapshot";

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
