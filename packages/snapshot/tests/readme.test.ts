import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { peerGroupSchema } from "../src/schema.ts";

/**
 * Issue #70: this package owns `peerGroupSchema`, and its README's field table
 * is where a reviewer reads what a `peerGroup` can be instead of opening
 * `schema.ts`. The list is pinned to the enum, the way `CONTEXT.md`, `DESIGN.md`
 * and the scoring README already are — a page one hub size behind the schema it
 * documents is worse than no page, because it reads as authoritative. Only facts
 * that exist in code are checked here; the prose is the author's.
 */
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

/** One row of the "What each airport carries" table, by its first cell. */
function fieldRow(field: string): string {
  const row = readme
    .split("\n")
    .find((line) => line.trim().startsWith(`| \`${field}\``));
  assert.ok(row, `the README has a field-table row for ${field}`);
  return row;
}

test("the README's peerGroup row names every hub size the schema accepts", () => {
  const row = fieldRow("peerGroup");
  for (const hubSize of peerGroupSchema.options) {
    assert.ok(row.includes(hubSize), `the row names ${hubSize}: ${row}`);
  }
});
