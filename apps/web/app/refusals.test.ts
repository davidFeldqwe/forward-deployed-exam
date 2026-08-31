import assert from "node:assert/strict";
import { test } from "node:test";

import { runAgentTool } from "./agent-tools.ts";
import { AGENT_SYSTEM_PROMPT } from "./agent.ts";
import { rankingView } from "./ranking-view.ts";
import {
  ACCEPTED_PLACE_PHRASES,
  OFF_THESIS_REFUSAL,
  SCREEN_ANSWERS,
  SCREEN_REFUSES,
  unknownIataRefusal,
  unknownPlaceRefusal,
} from "./refusals.ts";
import type { ToolCall } from "./thread-messages.ts";

test("the off-thesis refusal says what the screen will answer and what it will not", () => {
  // Story 31: an analyst who asked about cost must not come away thinking a deal
  // screen ran, so the copy names both halves rather than only declining.
  for (const subject of [/construction cost/i, /ROI/, /land/i, /politic/i, /lease/i]) {
    assert.match(OFF_THESIS_REFUSAL, subject);
  }
  for (const answered of SCREEN_ANSWERS) {
    assert.ok(OFF_THESIS_REFUSAL.includes(answered), `missing: ${answered}`);
  }
  for (const refused of SCREEN_REFUSES) {
    assert.ok(OFF_THESIS_REFUSAL.includes(refused), `missing: ${refused}`);
  }
  assert.match(OFF_THESIS_REFUSAL, /capacity-pressure screen/);
});

test("the unknown-place refusal lists the accepted phrases and geocodes nothing", () => {
  const refusal = unknownPlaceRefusal([{ field: "state", value: "California" }]);

  assert.match(refusal ?? "", /California/);
  assert.match(refusal ?? "", /state/);
  for (const phrase of ACCEPTED_PLACE_PHRASES) {
    assert.ok(refusal?.includes(phrase), `missing: ${phrase}`);
  }
  // Story 32's four phrase kinds, named in the copy an analyst reads.
  for (const kind of [/IATA/, /municipality/i, /two-letter state/i, /nine US Census divisions/i]) {
    assert.match(refusal ?? "", kind);
  }
  assert.equal(unknownPlaceRefusal([]), null);
});

test("a code outside the screened universe is refused as outside it, not as unknown", () => {
  const refusal = unknownIataRefusal(["ITH"]);

  assert.match(refusal ?? "", /ITH/);
  assert.match(refusal ?? "", /largest US airports/);
  assert.equal(unknownIataRefusal([]), null);
});

test("the answer objects carry the refusal, so it is drawn even if the prose omits it", () => {
  const result = runAgentTool("queryAirports", { state: "California", iata: ["LAX", "ITH"] });
  const call: ToolCall = {
    tool: "queryAirports",
    args: { state: "California", iata: ["LAX", "ITH"] },
    result: JSON.parse(JSON.stringify(result)),
    durationMs: 4,
  };
  const view = rankingView(call);

  assert.deepEqual(view?.unknown.place, [{ field: "state", value: "California" }]);
  assert.equal(view?.unknown.placeRefusal, unknownPlaceRefusal(view.unknown.place));
  assert.equal(view?.unknown.iataRefusal, unknownIataRefusal(["ITH"]));

  // A ranking that resolved everything refuses nothing.
  const resolved = runAgentTool("queryAirports", { region: "New England" });
  const clean = rankingView({
    ...call,
    args: { region: "New England" },
    result: JSON.parse(JSON.stringify(resolved)),
  });
  assert.equal(clean?.unknown.placeRefusal, null);
  assert.equal(clean?.unknown.iataRefusal, null);
});

test("the model is handed the same refusals the answer objects draw", () => {
  // The prose sits beside the answer objects, so both have to be the one copy:
  // a model paraphrasing the screen's scope is how a refusal turns into an
  // estimate of what it refused.
  assert.ok(AGENT_SYSTEM_PROMPT.includes(OFF_THESIS_REFUSAL));
  for (const phrase of ACCEPTED_PLACE_PHRASES) {
    assert.ok(AGENT_SYSTEM_PROMPT.includes(phrase), `missing: ${phrase}`);
  }
});
