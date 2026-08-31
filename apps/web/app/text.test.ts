import assert from "node:assert/strict";
import { test } from "node:test";

import { clip } from "./text.ts";

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
