import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { CANDIDATE_LAMPS } from "@repo/scoring";

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
  // Nor typed in as words. A lamp word is a coverage state the screen decided,
  // and this row is drawn before it ran — "Partial inputs" is a scored row with
  // a component missing, which is not the same absence as a row with no screen
  // behind it at all.
  for (const lamp of CANDIDATE_LAMPS) {
    assert.doesNotMatch(row, new RegExp(lamp, "i"), lamp);
  }
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
});

// The list and every block in it are a function of the messages, so an answer
// cannot decide it is in flight: only the block outside the message list reads
// the form status.
test("the pending answer is the one block that reads the form status", () => {
  const answers = readdirSync(new URL("components/answers/", web), { encoding: "utf8" })
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => `components/answers/${file}`);
  // The walk sees the file this is a claim about.
  assert.ok(answers.includes("components/answers/ThreadAnswer.tsx"));

  assert.deepEqual(
    answers.filter((file) => source(file).includes("useFormStatus")),
    ["components/answers/PendingAnswer.tsx"],
  );
  assert.doesNotMatch(source("app/thread-answer.ts"), /useFormStatus|react-dom/);
});

// Criterion 5's other half: "the in-flight question is a user turn, not part of
// the Thread answer". That it is not *in* the answer is pinned on the list —
// there is no field a question could arrive in. This is the half that says
// where it is instead: above the answer, in the turn chrome a landed question is
// set in, so Send does not change the shape of what is already on screen.
test("the question in flight is a user turn above the pending answer, not inside it", () => {
  const pending = source("components/answers/PendingAnswer.tsx");
  const asked = pending.indexOf('<RoleLabel role="user" />');
  const answering = pending.indexOf('<RoleLabel role="assistant" />');
  const list = pending.indexOf("<ThreadAnswer");

  assert.ok(asked > 0, "the question is drawn as a user turn");
  assert.ok(asked < answering, "and before the assistant's");
  assert.ok(answering < list, "which is what the pending list is drawn under");
  // The words under the user label are the question the composer holds.
  assert.match(pending.slice(asked, answering), /<Prose text=\{asked\}/);
  // Both sides of the same chrome: a question in flight is set like the same
  // question once it has landed in the transcript, so both files draw the turn
  // out of `Turn.tsx` rather than one of them writing its own.
  for (const file of ["components/answers/PendingAnswer.tsx", "components/Transcript.tsx"]) {
    const chrome = source(file).match(/import \{([^}]*)\} from "@\/components\/Turn"/)?.[1];
    assert.deepEqual(
      chrome
        ?.split(",")
        .map((name) => name.trim())
        .sort(),
      ["Prose", "RoleLabel"],
      file,
    );
  }
  // And the question reaches no block: all the tag switch is handed is the
  // constant list.
  assert.deepEqual(
    [...pending.matchAll(/<ThreadAnswer([^/>]*)\/>/g)].map(([, props]) => props.trim()),
    ["parts={PENDING_THREAD_ANSWER}"],
  );
});
