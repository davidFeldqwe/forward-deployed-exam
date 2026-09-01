import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { ScoredAirport } from "@repo/scoring";

import { rankingTableCsv, rankingTableTsv } from "./ranking-export.ts";
import { rankingView } from "./ranking-view.ts";
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

const twoRows = call({
  rows: [bos, hya],
  matched: 2,
  resolvedIata: ["BOS", "HYA"],
  sortBy: "composite",
  metric: null,
  limit: 10,
  unknownIata: [],
  unknownPlace: [],
});

test("Copy serializes IATA, name, composite, lamp and why-labels from the payload", () => {
  const rows = rankingView(twoRows)?.rows ?? [];
  const tsv = rankingTableTsv(rows);
  const lines = tsv.split("\n");

  assert.equal(lines[0], "IATA\tName\tComposite\tCandidate lamp\tWhy-labels");
  assert.equal(lines[1], "BOS\tBoston Logan Intl\t79\tStrong candidate\tLarge hub; Long-haul share 24.1%");
  // Withheld composite is empty, not a styled em-dash or a fake zero.
  assert.equal(lines[2], "HYA\tHyannis / Barnstable Muni\t\tPartial inputs\tSmall hub");
});

test("CSV is those same columns, not competitor financials", () => {
  const rows = rankingView(twoRows)?.rows ?? [];
  const csv = rankingTableCsv(rows);

  assert.equal(
    csv,
    [
      "IATA,Name,Composite,Candidate lamp,Why-labels",
      "BOS,Boston Logan Intl,79,Strong candidate,Large hub; Long-haul share 24.1%",
      "HYA,Hyannis / Barnstable Muni,,Partial inputs,Small hub",
    ].join("\n"),
  );
  for (const forbidden of [
    /operating profit/i,
    /\bHHI\b/,
    /Form 127/,
    /net revenue/i,
    /opportunity score/i,
  ]) {
    assert.doesNotMatch(csv, forbidden);
    assert.doesNotMatch(rankingTableTsv(rows), forbidden);
  }
});

test("a name with a comma is quoted in the CSV and left alone in the copy", () => {
  const rows = rankingView(
    call({
      rows: [{ ...bos, name: "Boston, Logan Intl" }],
      matched: 1,
      resolvedIata: ["BOS"],
      sortBy: "composite",
      metric: null,
      limit: 10,
      unknownIata: [],
      unknownPlace: [],
    }),
  )?.rows ?? [];

  assert.match(rankingTableCsv(rows), /"Boston, Logan Intl"/);
  assert.match(rankingTableTsv(rows), /\tBoston, Logan Intl\t/);
});

const web = new URL("../", import.meta.url);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

test("Copy and CSV serialize from the payload helpers, not from cell text", () => {
  const control = source("components/answers/RankingExport.tsx");
  const table = source("components/answers/Ranking.tsx");

  assert.match(control, /rankingTableTsv\(rows\)/);
  assert.match(control, /navigator\.clipboard\.writeText/);
  assert.match(control, /rankingTableCsv\(rows\)/);
  assert.match(control, /rankingExport\.csvFileName/);
  assert.match(control, /type="button"/);
  assert.doesNotMatch(control, /innerText|textContent|querySelector/);
  // Attached to the ranking table, not the lookup.
  assert.match(table, /<RankingExport rows=\{rows\}/);
  const lookup = table.slice(table.indexOf("function LookupTable"));
  assert.doesNotMatch(lookup, /RankingExport/);
});
