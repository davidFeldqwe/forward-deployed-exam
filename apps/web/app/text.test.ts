import assert from "node:assert/strict";
import { test } from "node:test";

import { clip, indexOfPhrase } from "./text.ts";

test("text within the bound comes back whole", () => {
  assert.equal(clip("Compare congestion at Santa Ana.", 80), "Compare congestion at Santa Ana.");
  assert.equal(clip("exactly", 7), "exactly");
});

test("a bound counts characters, so a clipped emoji is never cut in half", () => {
  // One character, two UTF-16 units: `slice(0, 4)` would keep a lone surrogate,
  // which is not valid UTF-8 and comes back out of a store as “�”.
  const kept = clip("at 🛫 Anchorage", 4);

  assert.equal(kept, "at 🛫");
  assert.equal(Buffer.from(kept, "utf8").toString("utf8"), kept);
  assert.equal(Array.from(clip("🛫🛫🛫", 2)).length, 2);
});

test("a phrase is found as words, not as letters inside a longer word", () => {
  // Both the carried context (does the question already name this airport?) and
  // the map gate (does it name a state?) hang on this distinction.
  assert.ok(indexOfPhrase("Which Maine airports are constrained?", "Maine") !== -1);
  assert.equal(indexOfPhrase("Are these maintained?", "Maine"), -1);
  assert.equal(indexOfPhrase("Which West Virginia airports?", "Virginia"), 10);
  assert.ok(indexOfPhrase("compare BOS and PVD", "BOS") !== -1);
  assert.equal(indexOfPhrase("compare BOSTON", "BOS"), -1);
});

test("a blank phrase is nowhere, and a phrase of punctuation is read literally", () => {
  // A row the snapshot gives no municipality would otherwise match every
  // question, and a place spelled with a dot is not a wildcard.
  assert.equal(indexOfPhrase("any question at all", ""), -1);
  assert.equal(indexOfPhrase("   ", " "), -1);
  assert.equal(indexOfPhrase("airports in St. Louis", "St. Louis"), 11);
  assert.equal(indexOfPhrase("airports in StXLouis", "St. Louis"), -1);
});
