import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { ScoredAirport } from "@repo/scoring";

import { compositeChart } from "./ranking-chart.ts";
import type { JsonObject, JsonValue, ToolCall } from "./thread-messages.ts";

const bos: ScoredAirport = {
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
  assumptions: [],
  gaps: [],
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
};

function call(result: JsonValue, args: JsonObject = { region: "New England" }): ToolCall {
  return { tool: "queryAirports", args, result, durationMs: 12 };
}

const ranking = call({
  rows: [bos, hya],
  matched: 2,
  resolvedIata: ["BOS", "HYA"],
  sortBy: "composite",
  metric: null,
  limit: 10,
  unknownIata: [],
  unknownPlace: [],
});

test("chart bars are composite by IATA, from the same payload as the table", () => {
  const chart = compositeChart(ranking);
  const [first, second] = chart?.bars ?? [];

  assert.equal(first?.iata, "BOS");
  assert.equal(first?.composite, 79);
  assert.equal(first?.lamp, "Strong candidate");
  assert.equal(second?.iata, "HYA");
  assert.equal(second?.composite, null);
  assert.equal(second?.lamp, "Partial inputs");
});

test("Partial inputs and No data have no composite bar", () => {
  const noData: ScoredAirport = {
    ...hya,
    iata: "ACK",
    name: "Nantucket Memorial",
    candidateLamp: "No data",
    composite: null,
    scoreVector: {
      congestion: { percentile: null, raw: null, coverage: "missing" },
      unmetFlightDemand: { percentile: null, raw: null, coverage: "missing" },
      delay: { percentile: null, raw: null, coverage: "missing" },
      growth: { percentile: null, raw: null, coverage: "missing" },
    },
  };
  const weak: ScoredAirport = {
    ...bos,
    iata: "PVD",
    composite: 22,
    candidateLamp: "Weak candidate",
  };
  const chart = compositeChart(
    call({
      rows: [weak, hya, noData],
      matched: 3,
      resolvedIata: ["PVD", "HYA", "ACK"],
      sortBy: "composite",
      metric: null,
      limit: 10,
      unknownIata: [],
      unknownPlace: [],
    }),
  );

  assert.deepEqual(
    chart?.bars.map((bar) => [bar.iata, bar.composite, bar.lamp]),
    [
      ["PVD", 22, "Weak candidate"],
      ["HYA", null, "Partial inputs"],
      ["ACK", null, "No data"],
    ],
  );
});

test("a single-metric lookup has no composite chart", () => {
  assert.equal(
    compositeChart(
      call({
        rows: [bos, hya],
        matched: 2,
        resolvedIata: ["BOS", "HYA"],
        sortBy: null,
        metric: "delay",
        limit: 10,
        unknownIata: [],
        unknownPlace: [],
      }),
    ),
    null,
  );
});

test("a ranking that matched nothing has no chart", () => {
  assert.equal(
    compositeChart(
      call({
        rows: [],
        matched: 0,
        resolvedIata: [],
        sortBy: "composite",
        metric: null,
        limit: 10,
        unknownIata: [],
        unknownPlace: [],
      }),
    ),
    null,
  );
  assert.equal(compositeChart(undefined), null);
});

const web = new URL("../", import.meta.url);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

test("the chart paints lamp hues on scored bars and prints no number for Partial inputs", () => {
  const chart = source("components/answers/CompositeChart.tsx");

  assert.match(chart, /lampBar\(bar\.lamp\)/);
  assert.match(chart, /<LampLegend/);
  assert.match(chart, /\{bar\.iata\}/);
  // A withheld composite draws the hollow track, not a filled bar with a fake length.
  assert.match(chart, /composite !== null/);
  assert.match(chart, /stroke-muted-foreground/);
  // Composite only: no competitor financials, no opportunity score.
  for (const forbidden of [/operating profit/i, /\bHHI\b/, /opportunity score/i, /net revenue/i]) {
    assert.doesNotMatch(chart, forbidden);
  }
});

test("the chart is an inline SVG with no chart library", () => {
  const chart = source("components/answers/CompositeChart.tsx");
  assert.match(chart, /<svg/);
  const manifest = JSON.parse(source("package.json")) as { dependencies: Record<string, string> };
  for (const dependency of Object.keys(manifest.dependencies)) {
    assert.doesNotMatch(dependency, /recharts|chart\.js|d3|victory|nivo|plotly/i);
  }
});

test("the chart sits after the map and before caveats", () => {
  const order = source("app/thread-answer.ts");
  const at = (tag: string) => {
    const index = order.indexOf(`"${tag}"`);
    assert.notEqual(index, -1, `missing ${tag} in THREAD_ANSWER_TAGS`);
    return index;
  };

  assert.ok(at("ranking") < at("map"));
  assert.ok(at("map") < at("chart"));
  assert.ok(at("chart") < at("caveats"));
});

test("the PRD states the chart is composite only, after the map, from the payload", () => {
  const prd = readFileSync(new URL("../../PRD.md", web), "utf8");
  const start = prd.indexOf("In-thread composite chart");
  assert.notEqual(start, -1, "PRD does not name the in-thread composite chart");
  const section = prd.slice(start, prd.indexOf("\n\n", start));

  assert.match(section, /composite score/i);
  assert.match(section, /after the map/i);
  assert.match(section, /Partial inputs/i);
  assert.match(section, /Copy/i);
  assert.match(section, /CSV/i);
  assert.match(section, /payload/i);
  assert.match(section, /operating profit/i);
});
