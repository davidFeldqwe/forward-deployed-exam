import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { pendingAnswer } from "./pending-answer.ts";
import { WITHHELD_COMPOSITE } from "./ranking-view.ts";

const web = new URL("../", import.meta.url);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

// Story 35: streaming shows a pending row with no scores yet. There is no DOM
// harness in this repo, so what a pending row may contain is pinned on the copy
// it draws and on the component that draws it.
test("the pending state carries no number, so none can be read as a score", () => {
  for (const line of Object.values(pendingAnswer)) {
    assert.doesNotMatch(line, /\d/, line);
    assert.ok(!line.includes(WITHHELD_COMPOSITE), line);
  }
  // It says what is missing and why, rather than leaving an empty cell to
  // explain itself.
  assert.match(pendingAnswer.note, /composite/i);
  assert.match(pendingAnswer.note, /candidate lamp/i);
});

test("the pending row draws no composite, no lamp pill and no hue", () => {
  const row = source("components/answers/PendingRow.tsx");

  // A lamp is a screen result; a pending row has none, so it neither imports the
  // pill map nor writes a hue class of its own.
  assert.doesNotMatch(row, /lampPill|lamp-(?:strong|mixed|weak)/);
  assert.doesNotMatch(row, /composite:|\/100/);
  // Every word on it comes from the pending tag it is handed, so a number cannot
  // be typed in here, and no answer object is in reach to read one from.
  assert.match(row, /row\.rowLabel/);
  assert.doesNotMatch(row, /ranking-view|scoreVector/);
});

test("the composer's form is what the pending answer is drawn inside", () => {
  const chat = source("components/Chat.tsx");
  const form = chat.indexOf("<form action={askQuestion}");
  const pending = chat.indexOf("<PendingAnswer");
  const composer = chat.indexOf("<InputGroupInput");

  // `useFormStatus` only reports on an ancestor form, so the pending answer and
  // the composer that submits it are inside the one form.
  assert.ok(form > 0 && pending > form, "the pending answer is inside the composer's form");
  assert.ok(composer > pending, "the transcript's pending row is drawn above the composer");
  // The pending answer is what reads the form status; nothing under the Thread
  // answer it draws does.
  assert.match(source("components/answers/PendingAnswer.tsx"), /useFormStatus/);
});
