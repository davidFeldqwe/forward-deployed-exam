import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  queryAirports,
  scoreUniverse,
  type QueryAirportsArgs,
  type QueryResult,
} from "@repo/scoring";
import { loadSnapshot } from "@repo/snapshot";

import {
  AIRPORT_PATH,
  COMPARE_PATH,
  RANK_PATH,
  rankQueryResponse,
  type RankQueryExtras,
} from "./rank-http.ts";

const scored = scoreUniverse(loadSnapshot());

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

async function bodyOf(url: string, extras?: RankQueryExtras): Promise<QueryResult> {
  const response = rankQueryResponse(url, extras);
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()) as QueryResult;
}

function equalsModule(body: QueryResult, args: QueryAirportsArgs): void {
  const expected = queryAirports(scored, args);
  // Key order included: stringify, not a key-set comparison that would hide a reorder.
  assert.equal(JSON.stringify(body), JSON.stringify(expected));
}

test("a pinned ranking's HTTP body equals the scoring-module result, key order included", async () => {
  const args = { region: "New England" } as const;
  const body = await bodyOf(`http://exam.test${RANK_PATH}?region=New%20England`);
  equalsModule(body, args);
});

test("one IATA's HTTP body equals the module result for that code", async () => {
  const body = await bodyOf(`http://exam.test${AIRPORT_PATH}/LAX`, { iata: "LAX" });
  equalsModule(body, { iata: "LAX" });
});

test("a two-code compare returns those two rows, not a city-market merge", async () => {
  const body = await bodyOf(`http://exam.test${COMPARE_PATH}/LAX/SNA`, {
    iata: ["LAX", "SNA"],
  });
  equalsModule(body, { iata: ["LAX", "SNA"] });
  assert.deepEqual(
    body.rows.map((row) => row.iata),
    ["LAX", "SNA"],
  );
});

test("the default limit and the 25 cap match queryAirports", async () => {
  const national = await bodyOf(`http://exam.test${RANK_PATH}`);
  equalsModule(national, {});
  assert.equal(national.limit, DEFAULT_LIMIT);
  assert.equal(national.rows.length, DEFAULT_LIMIT);

  const capped = await bodyOf(`http://exam.test${RANK_PATH}?limit=100`);
  equalsModule(capped, { limit: 100 });
  assert.equal(capped.limit, MAX_LIMIT);
  assert.equal(capped.rows.length, MAX_LIMIT);
});

test("the three curl surfaces exist as GET routes and share the rank helper", () => {
  assert.equal(RANK_PATH, "/api/rank");
  assert.equal(AIRPORT_PATH, "/api/airports");
  assert.equal(COMPARE_PATH, "/api/compare");

  const routes = [
    "./api/rank/route.ts",
    "./api/airports/[iata]/route.ts",
    "./api/compare/[left]/[right]/route.ts",
  ];
  for (const file of routes) {
    assert.ok(existsSync(new URL(file, import.meta.url)), file);
    const handler = source(file);
    assert.match(handler, /export (async )?function GET/);
    assert.match(handler, /rankQueryResponse/);
    assert.doesNotMatch(handler, /text\/event-stream|streamText/);
  }
});

test("these routes do not import or call an LLM vendor SDK", () => {
  const files = [
    "./rank-http.ts",
    "./api/rank/route.ts",
    "./api/airports/[iata]/route.ts",
    "./api/compare/[left]/[right]/route.ts",
  ];
  const vendor = /["']ai["']|@ai-sdk\/|from ["']ai\/|anthropic|openai|streamText/;
  for (const file of files) {
    const text = source(file);
    assert.doesNotMatch(text, vendor, file);
    assert.doesNotMatch(text, /convex/i, file);
    assert.doesNotMatch(text, /agent-model/, file);
  }
});

test("an off-list sortBy is a 400 naming the accepted keys, not a 500", async () => {
  const response = rankQueryResponse(`http://exam.test${RANK_PATH}?sortBy=roi`);
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /roi/);
  assert.match(body.error, /composite/);
});
