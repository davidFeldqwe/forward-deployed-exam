import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_LIMIT, queryAirports, scoreUniverse } from "@repo/scoring";
import { loadSnapshot, peerGroupSchema } from "@repo/snapshot";

import { AGENT_TOOL_SPECS, runAgentTool, scoredUniverse } from "./agent-tools.ts";
import { AGENT_TOOLS, parseThreadMessage, assistantMessage } from "./thread-messages.ts";

test("the agent has exactly the two tools the transcript may carry", () => {
  assert.deepEqual(Object.keys(AGENT_TOOL_SPECS), [...AGENT_TOOLS]);
});

test("a region question returns the scoring module's national composite ranking", () => {
  const expected = queryAirports(scoreUniverse(loadSnapshot()), { region: "New England" });
  const payload = runAgentTool("queryAirports", { region: "New England" });

  // The tool is a pass-through to the screen: same rows, same order, same numbers.
  assert.deepEqual(payload, JSON.parse(JSON.stringify(expected)));
  // #73: New England now matches every primary there, but the ranking still
  // draws DEFAULT_LIMIT rows — expanding the snapshot does not dump the set.
  assert.equal(payload.limit, DEFAULT_LIMIT);
  assert.equal(payload.rows.length, DEFAULT_LIMIT);
  assert.ok(payload.matched > DEFAULT_LIMIT, `matched ${payload.matched}`);
  assert.equal(payload.resolvedIata.length, payload.matched);
});

test("the universe is scored once, so two questions rank against the same distribution", () => {
  assert.equal(scoredUniverse(), scoredUniverse());
});

test("a ranking payload survives the store the transcript re-renders from", () => {
  const result = runAgentTool("queryAirports", { region: "New England" });
  const message = assistantMessage("Four airports are in New England.", [
    { tool: "queryAirports", args: { region: "New England" }, result, durationMs: 3 },
  ]);

  assert.deepEqual(parseThreadMessage(JSON.parse(JSON.stringify(message))), message);
});

test("the schema refuses an off-list sort key before the screen throws on one", () => {
  const { inputSchema } = AGENT_TOOL_SPECS.queryAirports;

  assert.equal(inputSchema.safeParse({ sortBy: "roi" }).success, false);
  assert.equal(inputSchema.safeParse({ iata: "BOSTON" }).success, false);
  assert.equal(inputSchema.safeParse({ limit: 500 }).success, false);
  // `null` is how a model spells "not asked for"; it must not refuse the call.
  assert.equal(inputSchema.safeParse({ region: "New England", state: null }).success, true);
});

test("describeMethodology names the window, the weights, the lamp bands and the accepted phrases", () => {
  const report = runAgentTool("describeMethodology", {});

  assert.deepEqual(report.comparisonWindow, { firstYear: 2023, secondYear: 2024 });
  assert.deepEqual(
    report.components.map(({ key, weight }) => [key, weight]),
    [
      ["congestion", 35],
      ["unmetFlightDemand", 35],
      ["delay", 20],
      ["growth", 10],
    ],
  );
  assert.deepEqual(
    report.candidateLamp.map(({ lamp }) => lamp),
    ["Strong candidate", "Mixed vector", "Weak candidate", "Partial inputs", "No data"],
  );
  assert.deepEqual(report.universe.peerGroups, [...peerGroupSchema.options].toSorted());
  assert.ok(
    report.universe.airports >= 300,
    `primary-scale universe, got ${report.universe.airports}`,
  );
  assert.ok(report.acceptedPlacePhrases.region.includes("New England"));
  assert.ok(report.acceptedPlacePhrases.state.includes("CA"));
});

test("the methodology's caveats are the ones the rows carry, not a second copy", () => {
  const report = runAgentTool("describeMethodology", {});
  const [row] = runAgentTool("queryAirports", { iata: "BOS" }).rows;

  for (const assumption of report.assumptions) {
    assert.ok(row?.assumptions.includes(assumption), `row is missing: ${assumption}`);
  }
  assert.deepEqual(report.gaps, row?.gaps.slice(0, report.gaps.length));
});
