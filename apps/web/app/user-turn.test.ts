import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const web = new URL("../", import.meta.url);
const THE_TURN = "components/Turn.tsx";
const THE_TRANSCRIPT = "components/Transcript.tsx";
const THE_PENDING_TURN = "components/answers/PendingAnswer.tsx";

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

function turnImports(file: string): string[] {
  const chrome = source(file).match(/import \{([^}]*)\} from "@\/components\/Turn"/)?.[1];
  return (
    chrome
      ?.split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
      .sort() ?? []
  );
}

// Issue #33: a question on its way must not look like a different species from
// one that has landed. Both files draw the analyst's words through `UserTurn`.
test("landed and in-flight questions share one user-turn chrome", () => {
  const turn = source(THE_TURN);
  assert.match(turn, /export function UserTurn/);
  assert.match(turn, /<RoleLabel role="user" \/>/);
  assert.match(turn, /<Prose text=\{text\}/);

  assert.match(source(THE_TRANSCRIPT), /<UserTurn text=\{message\.text\}/);
  assert.match(source(THE_PENDING_TURN), /<UserTurn text=\{asked\}/);

  for (const file of [THE_TRANSCRIPT, THE_PENDING_TURN]) {
    assert.deepEqual(turnImports(file), ["RoleLabel", "UserTurn"], file);
  }
});

function userTurnMarkup(file: string): string {
  const turn = source(file);
  const start = turn.indexOf("export function UserTurn");
  assert.ok(start >= 0, "UserTurn is missing");
  const next = turn.indexOf("export function", start + "export function UserTurn".length);
  return next < 0 ? turn.slice(start) : turn.slice(start, next);
}

// Issue #33: user questions are a right-aligned muted grey pill. Indigo stays
// send/focus/link; lamp hues stay on lamp words.
test("the user turn is a right-aligned grey pill that wraps long questions", () => {
  const pill = userTurnMarkup(THE_TURN);

  assert.match(pill, /items-end/);
  assert.match(pill, /bg-raised/);
  assert.match(pill, /rounded-/);
  assert.match(pill, /max-w-/);
  assert.match(pill, /break-words/);
  assert.doesNotMatch(pill, /bg-primary|lamp-(?:strong|mixed|weak)/);
});

// Pills are readability: no pop-in. Keyboard Send is high-frequency, so this
// chrome has no enter motion for anyone to drop under reduced-motion.
test("the user pill has no entrance motion", () => {
  const pill = userTurnMarkup(THE_TURN);
  assert.doesNotMatch(pill, /scale-0|zoom-in|animate-in|slide-in/);
});

test("agent turns stay left, un-pilled, and outside the user chrome", () => {
  const transcript = source(THE_TRANSCRIPT);
  const assistant = transcript.match(
    /message\.role === "assistant" \? \(([\s\S]*?)\) : \(/,
  )?.[1];
  assert.ok(assistant, "the transcript still branches the assistant turn");
  assert.match(assistant, /<RoleLabel role="assistant" \/>/);
  assert.match(assistant, /<ThreadAnswer /);
  assert.doesNotMatch(assistant, /UserTurn|bg-raised/);

  const pending = source(THE_PENDING_TURN);
  const answering = pending.slice(pending.indexOf('<RoleLabel role="assistant" />'));
  assert.match(answering, /<ThreadAnswer /);
  assert.doesNotMatch(answering, /UserTurn|bg-raised/);
});

test("empty chat still draws chips until the first question is sent", () => {
  const chat = source("components/Chat.tsx");
  assert.match(chat, /messages\.length === 0 \? \(/);
  assert.match(chat, /<PromptChips /);
  assert.match(chat, /<Transcript messages=\{messages\} \/>/);
  assert.doesNotMatch(chat, /UserTurn/);
});
