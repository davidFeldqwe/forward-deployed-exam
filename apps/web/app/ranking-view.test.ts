import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScoredAirport } from "@repo/scoring";

import { runAgentTool } from "./agent-tools.ts";
import { rankingView } from "./ranking-view.ts";
import type { JsonValue, ToolCall } from "./thread-messages.ts";

const bos: ScoredAirport = {
  iata: "BOS",
  name: "Boston Logan Intl",
  municipality: "Boston",
  state: "MA",
  region: "New England",
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
  assumptions: ["Weather delays are excluded."],
  gaps: ["No free source publishes gate capacity."],
};

const hya: ScoredAirport = {
  ...bos,
  iata: "HYA",
  name: "Hyannis / Barnstable Muni",
  municipality: "Hyannis",
  peerGroup: "small",
  scoreVector: {
    ...bos.scoreVector,
    delay: { percentile: null, raw: null, coverage: "missing" },
  },
  composite: null,
  candidateLamp: "Partial inputs",
  longHaulShare: null,
  assumptions: ["Weather delays are excluded.", "Delay is missing for HYA."],
  gaps: ["No free source publishes gate capacity.", "Long-haul share is not available for HYA."],
};

function call(result: JsonValue): ToolCall {
  return { tool: "queryAirports", args: { region: "New England" }, result, durationMs: 12 };
}

const twoRows = call({
  rows: [bos, hya],
  matched: 2,
  resolvedIata: ["BOS", "HYA"],
  sortBy: "composite",
  limit: 10,
  unknownIata: [],
  unknownPlace: [],
});

test("only a queryAirports payload becomes a ranking", () => {
  assert.equal(rankingView(undefined), null);
  assert.equal(rankingView({ ...twoRows, tool: "describeMethodology" }), null);
  assert.equal(rankingView(call({ matched: 2 })), null);
});

test("the resolved airport set names every match, not just the page", () => {
  const paged = call({
    rows: [bos],
    matched: 12,
    resolvedIata: ["BOS", "HYA", "PVD", "BDL", "PWM", "BTV", "ORH", "MHT", "ACK", "RUT", "LEB", "RKD"],
    sortBy: "composite",
    limit: 1,
    unknownIata: [],
    unknownPlace: [],
  });
  const view = rankingView(paged);

  assert.equal(view?.resolved.phrase, "New England");
  assert.equal(view?.resolved.codes.length, 12);
  assert.equal(view?.resolved.summary, "12 airports found · showing the top 1 by composite");
  assert.equal(rankingView(twoRows)?.resolved.summary, "2 airports found");
});

test("a row carries what the ranking table draws, in the order it ranks", () => {
  const [first, second] = rankingView(twoRows)?.rows ?? [];

  assert.equal(first?.rank, 1);
  assert.equal(first?.iata, "BOS");
  assert.equal(first?.composite, "79");
  assert.equal(first?.lamp, "Strong candidate");
  assert.deepEqual(first?.whyLabels, ["Large hub", "Long-haul share 24.1%"]);
  assert.equal(first?.coverage, "4 of 4");
  assert.equal(first?.peerLabel, "large FAA hubs");

  // Missing is not a low score: no composite number, and no coverage it does not have.
  assert.equal(second?.rank, 2);
  assert.equal(second?.composite, "—");
  assert.equal(second?.lamp, "Partial inputs");
  assert.equal(second?.coverage, "3 of 4");
  assert.deepEqual(second?.whyLabels, ["Small hub"]);
});

test("the score vector expands to percentile, raw value and weight", () => {
  const [first, second] = rankingView(twoRows)?.rows ?? [];

  assert.deepEqual(first?.vector, [
    {
      key: "congestion",
      label: "Congestion",
      percentile: "88 pctl",
      barPercent: 88,
      missing: false,
      raw: "12.4M enplanements/runway",
      weight: 35,
    },
    {
      key: "unmetFlightDemand",
      label: "Unmet flight demand",
      percentile: "81 pctl",
      barPercent: 81,
      missing: false,
      raw: "+6.2 pp",
      weight: 35,
    },
    {
      key: "delay",
      label: "Delay",
      percentile: "62 pctl",
      barPercent: 62,
      missing: false,
      raw: "14.8 min",
      weight: 20,
    },
    {
      key: "growth",
      label: "Growth",
      percentile: "71 pctl",
      barPercent: 71,
      missing: false,
      raw: "+8.4%",
      weight: 10,
    },
  ]);

  // A blank draws no bar and says so in words, rather than a zero-length bar.
  assert.deepEqual(second?.vector[2], {
    key: "delay",
    label: "Delay",
    percentile: "no data",
    barPercent: 0,
    missing: true,
    raw: "Not reported",
    weight: 20,
  });
});

test("caveats are this answer's, gathered off the rows it shows", () => {
  const view = rankingView(twoRows);

  assert.deepEqual(view?.assumptions, [
    "Weather delays are excluded.",
    "Delay is missing for HYA.",
  ]);
  assert.deepEqual(view?.gaps, [
    "No free source publishes gate capacity.",
    "Long-haul share is not available for HYA.",
  ]);
});

test("a real ranking off the committed screen renders every row it was handed", () => {
  const result = runAgentTool("queryAirports", { region: "New England" });
  const view = rankingView(call(result));

  assert.equal(view?.rows.length, result.rows.length);
  assert.deepEqual(view?.resolved.codes, result.resolvedIata);
  assert.deepEqual(
    view?.rows.map((row) => row.iata),
    result.rows.map((row) => row.iata),
  );
});
