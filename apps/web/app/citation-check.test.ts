import assert from "node:assert/strict";
import { test } from "node:test";

import { queryAirports } from "@repo/scoring";

import { checkNewEnglandRanking } from "./citation-check.ts";
import { runAgentTool, toolPayloadJson } from "./agent-tools.ts";
import { assistantMessage } from "./thread-messages.ts";

const ranking = runAgentTool("queryAirports", { region: "New England" });
const methodology = {
  tool: "describeMethodology" as const,
  args: {},
  result: toolPayloadJson(runAgentTool("describeMethodology", {})),
  durationMs: 2,
};
const queryCall = {
  tool: "queryAirports" as const,
  args: { region: "New England" },
  result: toolPayloadJson(ranking),
  durationMs: 7,
};

const onPage = ranking.rows[0];
assert.ok(onPage, "the New England page has a leading row");
const offPage = ranking.resolvedIata.find((code) => !ranking.rows.some((row) => row.iata === code));
assert.ok(offPage, "the resolved set is larger than the ten-row page");

function answer(text: string, extra: typeof methodology | null = null) {
  return assistantMessage(text, extra ? [queryCall, extra] : [queryCall]);
}

test("an invented IATA in prose fails even when the tool call is a New England ranking", () => {
  const verdict = checkNewEnglandRanking(answer(`${onPage.iata} leads; CDG is not in the set.`));
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /CDG/);
});

test("an invented composite fails", () => {
  const invented = 12;
  assert.ok(
    !ranking.rows.some((row) => row.composite === invented),
    "the fixture composite is not on the page",
  );
  const verdict = checkNewEnglandRanking(
    answer(`${onPage.iata} leads the set at composite ${invented}.`),
  );
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /composite/i);
});

test("a resolvedIata code not on the ten-row page may be named without a composite", () => {
  const verdict = checkNewEnglandRanking(
    answer(
      `${onPage.iata} leads at composite ${onPage.composite}. ${offPage} is in the resolved set but not on this page.`,
    ),
  );
  assert.equal(verdict.ok, true, verdict.reason);
});

test("a resolvedIata code not on the page must not carry an invented composite", () => {
  const verdict = checkNewEnglandRanking(
    answer(`${offPage} sits at composite 3, which this page never returned.`),
  );
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /composite/i);
});

test("prose that cites a page row's own composite and percentile passes", () => {
  const percentile = onPage.scoreVector.congestion.percentile;
  assert.ok(percentile !== null);
  const verdict = checkNewEnglandRanking(
    answer(
      `${onPage.iata} is the top renovation-investment candidate at composite ${onPage.composite}, congestion ${percentile}th percentile among its peer group.`,
    ),
  );
  assert.equal(verdict.ok, true, verdict.reason);
});

test("describeMethodology is optional beside a New England queryAirports call", () => {
  const prose = `${onPage.iata} leads at composite ${onPage.composite}.`;
  assert.equal(checkNewEnglandRanking(answer(prose)).ok, true);
  assert.equal(checkNewEnglandRanking(answer(prose, methodology)).ok, true);
});

test("the call must be queryAirports with region New England and matched > 0", () => {
  const empty = queryAirports([], { region: "New England" });
  assert.equal(empty.matched, 0);
  const texas = runAgentTool("queryAirports", { region: "West South Central" });
  assert.ok(texas.matched > 0);

  assert.equal(
    checkNewEnglandRanking(assistantMessage(`${onPage.iata} leads.`, [])).ok,
    false,
    "no tool call",
  );
  assert.equal(
    checkNewEnglandRanking(
      assistantMessage(`${onPage.iata} leads.`, [
        {
          tool: "queryAirports",
          args: { region: "West South Central" },
          result: toolPayloadJson(texas),
          durationMs: 4,
        },
      ]),
    ).ok,
    false,
    "wrong region",
  );
  assert.equal(
    checkNewEnglandRanking(
      assistantMessage("Nothing matched.", [
        {
          tool: "queryAirports",
          args: { region: "New England" },
          result: toolPayloadJson(empty),
          durationMs: 4,
        },
      ]),
    ).ok,
    false,
    "matched is 0",
  );
});
