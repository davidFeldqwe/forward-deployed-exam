import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { runAgentTool, toolPayloadJson } from "./agent-tools.ts";
import { readAloud, spokenProse } from "./read-aloud.ts";
import {
  assistantMessage,
  userMessage,
  rankingRows,
  type ThreadMessage,
  type ToolCall,
} from "./thread-messages.ts";

function call(args: Record<string, string | string[]>): ToolCall {
  return {
    tool: "queryAirports",
    args,
    result: toolPayloadJson(runAgentTool("queryAirports", args)),
    durationMs: 8,
  };
}

const newEngland = call({ region: "New England" });

const ANSWER = "Four New England airports came back, ranked by composite.";
const FOLLOW_UP = "Bradley's delay percentile is the reason it sits second.";

function thread(...messages: ThreadMessage[]): ThreadMessage[] {
  return messages;
}

// Story 37 / issue #28: the control reads the last assistant prose, and only the
// prose. Everything else in an answer — the ranking table, the score vector, the
// resolved set — is rendered from the tool payload and stays in the DOM for a
// screen reader rather than being narrated over.
test("the last assistant turn with prose is the one that speaks", () => {
  const messages = thread(
    userMessage("Which airports in New England are renovation-investment candidates?"),
    assistantMessage(ANSWER, [newEngland]),
    userMessage("Tell me more about the second one."),
    assistantMessage(FOLLOW_UP, [call({ iata: "BDL" })]),
  );

  assert.equal(spokenProse(messages, 3), FOLLOW_UP);
  // An earlier answer keeps its prose on screen; it does not keep a control.
  assert.equal(spokenProse(messages, 1), null);
  assert.equal(spokenProse(messages, 0), null);
  assert.equal(spokenProse(messages, 2), null);
});

test("what is spoken is the prose string, not the payload the table drew", () => {
  const messages = thread(
    userMessage("Which airports in New England are renovation-investment candidates?"),
    assistantMessage(ANSWER, [newEngland]),
  );
  const spoken = spokenProse(messages, 1);
  const rows = rankingRows(newEngland) ?? [];

  assert.ok(rows.length > 1, "the fixture answer carries a ranking table");
  assert.equal(spoken, ANSWER);
  // Nothing the screen computed is read out: not a composite, not a percentile,
  // not a code from the resolved airport set.
  for (const row of rows) {
    assert.doesNotMatch(spoken ?? "", new RegExp(row.iata));
    assert.doesNotMatch(spoken ?? "", new RegExp(String(row.composite)));
  }
});

test("an answer that is only a table has nothing to read aloud", () => {
  // The model returned rows and no sentence. There is no prose, so there is no
  // control — and the last answer that did have prose keeps its own.
  const messages = thread(
    userMessage("Which airports in New England are renovation-investment candidates?"),
    assistantMessage(ANSWER, [newEngland]),
    userMessage("And Bradley?"),
    assistantMessage("  ", [call({ iata: "BDL" })]),
  );

  assert.equal(spokenProse(messages, 3), null);
  assert.equal(spokenProse(messages, 1), ANSWER);
});

test("an empty thread and an out-of-range turn speak nothing", () => {
  assert.equal(spokenProse([], 0), null);
  assert.equal(spokenProse(thread(userMessage("hello")), 5), null);
});

test("the control's copy says it is the browser reading the prose", () => {
  assert.match(readAloud.label, /read aloud/i);
  assert.match(readAloud.note, /prose/i);
  assert.match(readAloud.note, /browser/i);
  // The numbers are not narrated, and the copy says so rather than leaving the
  // analyst to discover it by pressing the control.
  assert.match(readAloud.note, /table|score vector/i);
});

const web = new URL("../", import.meta.url);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

test("the control speaks its prose prop through the browser speech API alone", () => {
  const control = source("components/answers/ReadAloud.tsx");

  assert.match(control, /speechSynthesis/);
  // The utterance is built from the prose handed in, so no other string on the
  // answer can reach the speaker.
  assert.match(control, /new SpeechSynthesisUtterance\(text\)/);
  assert.match(control, /\.cancel\(\)/);
  // No vendor, no route, no key: the speech never leaves the browser.
  assert.doesNotMatch(control, /fetch\(|\/api\//);
  // It is handed a string, not an answer object it could walk into the table.
  assert.doesNotMatch(control, /ranking-view|scoreVector|composite/);
  // The transcript is inside the composer's form, so a control that forgot this
  // would send the draft question instead of speaking.
  assert.match(control, /type="button"/);
});

test("the transcript hands the control only the prose the thread last wrote", () => {
  const transcript = source("components/Transcript.tsx");

  assert.match(transcript, /spokenProse\(messages, index\)/);
  assert.match(transcript, /<ReadAloud text=\{/);
});

/** Every module the browser bundle is built from, as one haystack. */
const clientSource = ["app", "components", "lib"]
  .flatMap((directory) =>
    readdirSync(new URL(`${directory}/`, web), { encoding: "utf8", recursive: true })
      .filter((file) => (file.endsWith(".ts") || file.endsWith(".tsx")) && !file.endsWith(".test.ts"))
      .map((file) => source(`${directory}/${file}`)),
  )
  .join("\n");

test("no microphone, no voice input and no cloud speech vendor anywhere", () => {
  for (const forbidden of [
    /getUserMedia/,
    /MediaRecorder/,
    /SpeechRecognition/,
    /AudioContext/,
    /elevenlabs/i,
    /text-to-speech/i,
    /\bpolly\b/i,
  ]) {
    assert.doesNotMatch(clientSource, forbidden, String(forbidden));
  }
});

const repo = new URL("../../", web);

test("PRD Out of Scope reopens browser read-aloud and still refuses voice input", () => {
  const prd = readFileSync(new URL("PRD.md", repo), "utf8");
  const start = prd.indexOf("## Out of Scope");
  assert.notEqual(start, -1);
  // Just this section: the Further Notes under it are not the ban list.
  const outOfScope = prd.slice(start).split("\n## ")[0] ?? "";

  assert.match(outOfScope, /voice input/i);
  assert.match(outOfScope, /cloud (?:TTS|speech)/i);
  assert.match(outOfScope, /PDF/);
  // The one thing this issue builds is no longer forbidden by the line above it.
  assert.doesNotMatch(outOfScope, /read.aloud/i);
});
