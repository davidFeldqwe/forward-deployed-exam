import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScoredAirport } from "@repo/scoring";

import {
  THREAD_TITLE_MAX_LENGTH,
  type ToolCall,
  assistantMessage,
  parseThreadMessage,
  rankingRows,
  threadTitle,
  userMessage,
} from "./thread-messages.ts";

test("a thread is titled with its first user question", () => {
  assert.equal(
    threadTitle("  Which airports in New England are renovation-investment candidates?  "),
    "Which airports in New England are renovation-investment candidates?",
  );
});

test("a title collapses whitespace and is bounded, so the recents list stays one line", () => {
  assert.equal(threadTitle("Compare congestion at\n  Los Angeles\tand Santa Ana."),
    "Compare congestion at Los Angeles and Santa Ana.");

  const long = threadTitle(`Which airports ${"x".repeat(200)} are candidates?`);
  assert.equal(long.length, THREAD_TITLE_MAX_LENGTH);
  assert.equal(long.endsWith("…"), true);
});

const bosRow: ScoredAirport = {
  iata: "BOS",
  name: "Boston Logan Intl",
  municipality: "Boston",
  state: "MA",
  region: "New England",
  latitude: 42.3643,
  longitude: -71.0052,
  peerGroup: "large",
  scoreVector: {
    congestion: { percentile: 88, raw: 12_400_000, coverage: "present" },
    unmetFlightDemand: { percentile: 81, raw: 6.2, coverage: "present" },
    delay: { percentile: 62, raw: 14.8, coverage: "present" },
    growth: { percentile: 71, raw: 8.4, coverage: "present" },
  },
  composite: 79,
  candidateLamp: "Strong candidate",
  slotLimit: null,
  longHaulShare: 0.241,
  assumptions: ["Weather delays excluded from the delay component."],
  gaps: [],
};

const rankingCall: ToolCall = {
  tool: "queryAirports",
  args: { region: "New England", sortBy: "composite", limit: 10 },
  result: { rows: [bosRow] },
  durationMs: 318,
};

test("an assistant message carries the tool payload a ranking, score vector and lamp re-render from", () => {
  const message = assistantMessage("One airport clears the threshold: BOS at 79.", [rankingCall]);

  // The store boundary is a JSON round trip, whether it is Convex or this process.
  const restored = parseThreadMessage(JSON.parse(JSON.stringify(message)));

  assert.deepEqual(restored, message);
  assert.deepEqual(rankingRows(restored?.toolCalls[0]), [bosRow]);
});

test("only a queryAirports payload carries ranking rows", () => {
  const methodology = assistantMessage("Weights are fixed at 35/35/20/10.", [
    { tool: "describeMethodology", args: {}, result: { weights: {} }, durationMs: 2 },
  ]);

  assert.equal(rankingRows(methodology.toolCalls[0]), null);
  assert.equal(rankingRows(userMessage("Which airports?").toolCalls[0]), null);
});

test("a user message is text with no tool payload", () => {
  const message = userMessage("  Which airports in New England are candidates?  ");
  assert.deepEqual(message, {
    role: "user",
    text: "Which airports in New England are candidates?",
    toolCalls: [],
  });
});

test("a stored ranking payload that lost its lamp or score vector is refused", () => {
  const withoutLamp = structuredClone(rankingCall) as ToolCall;
  delete (withoutLamp.result as { rows: Record<string, unknown>[] }).rows[0]!.candidateLamp;

  const withoutVector = structuredClone(rankingCall) as ToolCall;
  delete (withoutVector.result as { rows: Record<string, unknown>[] }).rows[0]!.scoreVector;

  for (const broken of [withoutLamp, withoutVector]) {
    assert.equal(parseThreadMessage(assistantMessage("prose", [broken])), null);
  }
});

// #26: the stored payload is the only re-render source, so the coordinates a map
// is drawn from have to survive the store — and be refused when they are not a
// point, rather than placing a marker in the sea.
test("a stored ranking row keeps the coordinates a map is drawn from", () => {
  const restored = parseThreadMessage(
    JSON.parse(JSON.stringify(assistantMessage("BOS at 79.", [rankingCall]))),
  );
  const [row] = rankingRows(restored?.toolCalls[0]) ?? [];

  assert.equal(row?.latitude, 42.3643);
  assert.equal(row?.longitude, -71.0052);
});

test("a stored row with half a coordinate, or one off the world, is refused", () => {
  const rowOf = (call: ToolCall) =>
    (call.result as { rows: Record<string, unknown>[] }).rows[0]!;

  const brokenPairs = [
    { latitude: 42.3643, longitude: null },
    { latitude: null, longitude: -71.0052 },
    { latitude: 91, longitude: -71.0052 },
    { latitude: 42.3643, longitude: -181 },
    { latitude: "42.3643", longitude: "-71.0052" },
  ];
  for (const pair of brokenPairs) {
    const broken = structuredClone(rankingCall) as ToolCall;
    Object.assign(rowOf(broken), pair);
    assert.equal(
      parseThreadMessage(assistantMessage("prose", [broken])),
      null,
      JSON.stringify(pair),
    );
  }

  // An airport the source does not locate is a whole row: both nulls stay.
  const unlocated = structuredClone(rankingCall) as ToolCall;
  Object.assign(rowOf(unlocated), { latitude: null, longitude: null });
  assert.notEqual(parseThreadMessage(assistantMessage("prose", [unlocated])), null);
});

test("a stored message from an unknown role or tool is refused", () => {
  assert.equal(parseThreadMessage({ role: "system", text: "be nice", toolCalls: [] }), null);
  assert.equal(
    parseThreadMessage({
      role: "assistant",
      text: "prose",
      toolCalls: [{ tool: "rank_airports", args: {}, result: {}, durationMs: 1 }],
    }),
    null,
  );
  assert.equal(parseThreadMessage({ role: "user", text: 42, toolCalls: [] }), null);
  assert.equal(parseThreadMessage(null), null);
});

test("a stored ranking row is checked field by field, so no drawn value goes missing", () => {
  // The message list is the only re-render source: a row that lost its name,
  // peer group, slot limit or caveats would draw a blank cell or silently drop
  // a caveat, so every field the answer objects read has to be present.
  for (const field of Object.keys(bosRow)) {
    const truncated = structuredClone(rankingCall) as ToolCall;
    const rows = (truncated.result as { rows: Record<string, unknown>[] }).rows;
    delete rows[0]![field];

    assert.equal(
      parseThreadMessage(assistantMessage("prose", [truncated])),
      null,
      `a row missing ${field} was stored anyway`,
    );
  }
});

test("a message with neither text nor a tool payload has nothing to render, so it is refused", () => {
  assert.equal(parseThreadMessage(assistantMessage("")), null);
  assert.equal(parseThreadMessage(userMessage("   ")), null);
  // Prose alone, or a tool payload alone, both render.
  assert.notEqual(parseThreadMessage(assistantMessage("BOS leads at 79.")), null);
  assert.notEqual(parseThreadMessage(assistantMessage("", [rankingCall])), null);
});

test("a bounded title is cut between characters, so recents never shows half a symbol", () => {
  // The bound used to count UTF-16 units, so a question whose emoji straddles
  // the cut stored a lone surrogate: not valid UTF-8, drawn as “�” by every
  // store that re-encodes it on the way out.
  const kept = `Which airports ${"x".repeat(63)}`;
  const title = threadTitle(`${kept}🛫 are renovation-investment candidates?`);

  assert.equal(title, `${kept}🛫…`);
  assert.equal(Buffer.from(title, "utf8").toString("utf8"), title);
  assert.equal(Array.from(title).length, THREAD_TITLE_MAX_LENGTH);
});
