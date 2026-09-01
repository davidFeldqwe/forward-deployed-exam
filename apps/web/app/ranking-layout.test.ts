import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const web = new URL("../", import.meta.url);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

const ranking = source("components/answers/Ranking.tsx");
const pending = source("components/answers/PendingRow.tsx");
const styles = source("app/globals.css");

const RIGID_RANKING = /grid-cols-\[26px_1fr_74px_150px/;
const RIGID_VECTOR = /grid-cols-\[1\.5fr_1\.35fr_1\.5fr_0\.5fr\]/;

test("a ranking row is a disclosure of that airport's score vector", () => {
  assert.match(ranking, /<details\b/);
  assert.match(ranking, /<summary\b/);
  assert.match(ranking, /<ScoreVector row=\{row\}/);
});

test("ranking and pending-ranking columns shrink and wrap in a narrow chat column", () => {
  for (const [name, file] of [
    ["ranking", ranking],
    ["pending", pending],
  ] as const) {
    // Fixed tracks that cannot wrap are what clipped the lamp and composite
    // inside overflow-hidden. The airport cell has to be allowed to shrink.
    assert.doesNotMatch(file, RIGID_RANKING, name);
    assert.match(file, /min-w-0/, name);
    assert.match(file, /flex-wrap/, name);
  }

  // A lookup has fewer columns, but a long airport name still needs the same
  // shrink rather than a 150px third track that eats the name.
  assert.doesNotMatch(ranking, /LOOKUP_GRID = "grid grid-cols-\[26px_1fr_150px\]/);
  assert.match(ranking, /LOOKUP_GRID[\s\S]*minmax\(0,/);
});

test("the score vector stays readable when the ranking column is narrow", () => {
  assert.doesNotMatch(ranking, RIGID_VECTOR);
  // Below `sm` the four fields share two columns; from `sm` they use minmax
  // tracks so a long component name wraps instead of clipping.
  assert.match(ranking, /VECTOR_GRID[\s\S]*grid-cols-2/);
  assert.match(ranking, /VECTOR_GRID[\s\S]*minmax\(0,/);
});

test("hover paint on a ranking row waits for a fine pointer", () => {
  // A tap must not leave the raised fill stuck after the vector opens.
  assert.match(ranking, /data-ranking-row/);
  assert.doesNotMatch(ranking, /hover:bg-/);
  assert.match(
    styles,
    /@media \(hover: hover\) and \(pointer: fine\) \{\s*\[data-ranking-row\]:hover/,
  );
});

test("keyboard focus on the ranking disclosure remains visible", () => {
  const summary = ranking.match(/<summary\b[^>]*>/)?.[0];
  assert.ok(summary, "the row is a summary");
  assert.match(summary, /focus-visible:ring/);
});
