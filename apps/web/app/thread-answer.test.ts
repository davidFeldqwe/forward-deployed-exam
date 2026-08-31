import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CANDIDATE_LAMPS } from "@repo/scoring";

import { runAgentTool, toolPayloadJson } from "./agent-tools.ts";
import { pendingAnswer } from "./pending-answer.ts";
import { WITHHELD_COMPOSITE } from "./ranking-view.ts";
import {
  PENDING_THREAD_ANSWER,
  PROSE_HEADING,
  THREAD_ANSWER_TAGS,
  threadAnswer,
  type ThreadAnswerPart,
  type ThreadAnswerTag,
} from "./thread-answer.ts";
import {
  assistantMessage,
  userMessage,
  type ThreadMessage,
  type ToolCall,
} from "./thread-messages.ts";

function query(args: Record<string, string | string[]>): ToolCall {
  return {
    tool: "queryAirports",
    args,
    result: toolPayloadJson(runAgentTool("queryAirports", args)),
    durationMs: 8,
  };
}

const methodology: ToolCall = {
  tool: "describeMethodology",
  args: {},
  result: toolPayloadJson(runAgentTool("describeMethodology", {})),
  durationMs: 3,
};

const newEngland = query({ region: "New England" });

/** A query the screen ran and matched nothing with: a resolved set, no rows. */
const matchedNothing: ToolCall = {
  tool: "queryAirports",
  args: { region: "New England" },
  result: { rows: [], matched: 0, resolvedIata: [], sortBy: "composite", limit: 10 },
  durationMs: 4,
};

function tags(parts: readonly ThreadAnswerPart[]): ThreadAnswerTag[] {
  return parts.map((part) => part.tag);
}

/** The Thread answer for a thread of one question and the answer to it. */
function answerTurn(answer: ThreadMessage): ThreadAnswerPart[] {
  return threadAnswer([userMessage("Which ones?"), answer], 1);
}

/** A ranking answer, and the follow-up whose reference the thread resolved. */
const followUpThread: ThreadMessage[] = [
  userMessage("Which airports in New England are renovation-investment candidates?"),
  assistantMessage("PVD leads the set.", [newEngland]),
  userMessage("Tell me more about the second one."),
  assistantMessage("Bradley's delay percentile is the reason.", [query({ iata: "BDL" })]),
];

// The locked grouped order (issue #35), asserted on the list the transcript
// draws rather than on the order components happen to be written in.
test("a stored ranking turn is one list: tool, resolved set, prose, table, caveats", () => {
  const messages = [
    userMessage("Which airports in New England are renovation-investment candidates?"),
    assistantMessage("PVD leads the set.", [newEngland]),
  ];

  assert.deepEqual(tags(threadAnswer(messages, 1)), [
    "tool",
    "resolved",
    "prose",
    "ranking",
    "caveats",
  ]);
});

test("carried context sits before the resolved airport set and the table", () => {
  const list = tags(threadAnswer(followUpThread, 3));

  assert.deepEqual(list, ["tool", "carried", "resolved", "prose", "ranking", "caveats"]);
  assert.ok(list.indexOf("carried") < list.indexOf("resolved"));
  assert.ok(list.indexOf("carried") < list.indexOf("ranking"));
});

// Two calls in one turn are grouped by tag, not interleaved per call: every
// resolved set, then the one prose, then every table, then one caveats block.
test("two queryAirports calls group all sets, then prose, then all tables, then one caveats", () => {
  const pacific = query({ region: "Pacific" });
  const messages = [
    userMessage("Compare New England and the Pacific division."),
    assistantMessage("Both sets are led by a large hub.", [newEngland, pacific]),
  ];
  const parts = threadAnswer(messages, 1);

  assert.deepEqual(tags(parts), [
    "tool",
    "tool",
    "resolved",
    "resolved",
    "prose",
    "ranking",
    "ranking",
    "caveats",
  ]);

  const caveats = parts.filter((part) => part.tag === "caveats");
  assert.equal(caveats.length, 1);
  // One block, so a line both queries carry is printed once.
  const lines = [...caveats[0]!.assumptions, ...caveats[0]!.gaps];
  assert.equal(new Set(lines).size, lines.length);
  assert.ok(lines.length > 0);
});

test("a methodology-only turn is tool and prose, and nothing it has no rows for", () => {
  const messages = [
    userMessage("How is the composite weighted?"),
    assistantMessage("Congestion and unmet flight demand carry 35 each.", [methodology]),
  ];

  assert.deepEqual(tags(threadAnswer(messages, 1)), ["tool", "prose"]);
});

test("an empty tag is omitted: no rows is no table and no caveats", () => {
  const messages = [
    userMessage("Anything in Nunavut?"),
    assistantMessage("Nothing matched.", [matchedNothing]),
  ];

  // The resolved set still speaks — it is what says nothing matched.
  assert.deepEqual(tags(threadAnswer(messages, 1)), ["tool", "resolved", "prose"]);

  // Prose with no tool call at all is one tag.
  const proseOnly = [userMessage("Hello."), assistantMessage("Ask about an airport.")];
  assert.deepEqual(tags(threadAnswer(proseOnly, 1)), ["prose"]);
});

test("the prose heading is drawn only where a table sits under it", () => {
  const heading = (message: ThreadMessage) =>
    answerTurn(message).find((part) => part.tag === "prose")?.heading;

  assert.equal(heading(assistantMessage("PVD leads.", [newEngland])), PROSE_HEADING);
  assert.equal(heading(assistantMessage("Congestion is 35.", [methodology])), null);
  // A query that matched nothing draws no table, so the boundary the label
  // marks has nothing on the other side of it: no label either.
  assert.equal(heading(assistantMessage("Nothing matched.", [matchedNothing])), null);
  // One call of two matched rows: there is a table under the prose, so the
  // label is drawn.
  assert.equal(heading(assistantMessage("PVD leads.", [matchedNothing, newEngland])), PROSE_HEADING);
});

test("only an assistant turn has a Thread answer", () => {
  const messages = [userMessage("New England?"), assistantMessage("PVD leads.", [newEngland])];

  assert.deepEqual(threadAnswer(messages, 0), []);
  assert.deepEqual(threadAnswer(messages, 9), []);
});

// Story 35: after Send there is a row and no scores in it. The claim is on the
// list, so a pending answer cannot acquire a table by someone editing JSX.
test("the pending Thread answer is one pending row and nothing else", () => {
  assert.deepEqual(tags(PENDING_THREAD_ANSWER), ["pending"]);

  const [row] = PENDING_THREAD_ANSWER;
  // It holds the copy it draws and no field a score could arrive in — no
  // composite, no candidate lamp, no score vector, no rows.
  assert.deepEqual(Object.keys(row).sort(), ["airportLabel", "label", "note", "rowLabel", "tag"]);
  assert.equal(row.rowLabel, pendingAnswer.rowLabel);
  // Not a withheld composite either: the screen has not run.
  assert.doesNotMatch(JSON.stringify(row), new RegExp(WITHHELD_COMPOSITE));
  // And not a candidate lamp: the one pill this row draws sits in the lamp
  // column, so a lamp word in its copy would read as a coverage state the
  // screen decided — "Partial inputs" most of all, which says a row was scored
  // with a component missing. Nothing has been scored.
  for (const lamp of CANDIDATE_LAMPS) {
    assert.doesNotMatch(JSON.stringify(row), new RegExp(lamp, "i"), lamp);
  }
});

// `THREAD_ANSWER_TAGS` is the locked order itself, not a bag of names: every
// answer this module composes reads down it. The example tests above each pin
// one turn's sequence; this pins the rule they are examples of, including for
// the turns nobody wrote an example for.
test("every Thread answer reads down the locked tag order", () => {
  const turns: ThreadAnswerPart[][] = [
    ...followUpThread.map((_, at) => threadAnswer(followUpThread, at)),
    answerTurn(assistantMessage("Two sets.", [newEngland, matchedNothing])),
    answerTurn(assistantMessage("Congestion is 35.", [methodology])),
    answerTurn(assistantMessage("Nothing matched.", [matchedNothing])),
    answerTurn(assistantMessage("Ask about an airport.")),
    [...PENDING_THREAD_ANSWER],
  ];

  for (const parts of turns) {
    const named = tags(parts);
    const places = named.map((tag) => THREAD_ANSWER_TAGS.indexOf(tag));
    // A tag the locked order does not name has no place to be drawn in.
    assert.ok(!places.includes(-1), named.join(", "));
    assert.deepEqual(places, [...places].sort((a, b) => a - b), named.join(", "));
  }
});

// The transcript draws tags. It cannot draw one it has no case for, and the
// list is free to hand it any of them, so the two are pinned to each other.
test("every tag a Thread answer may hold is drawn by the component", () => {
  const component = readFileSync(
    new URL("../components/answers/ThreadAnswer.tsx", import.meta.url),
    "utf8",
  );

  for (const tag of THREAD_ANSWER_TAGS) {
    assert.match(component, new RegExp(`case "${tag}":`), tag);
  }
});
