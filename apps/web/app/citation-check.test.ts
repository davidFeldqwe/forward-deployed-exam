import assert from "node:assert/strict";
import { test } from "node:test";

import { queryAirports } from "@repo/scoring";

import { runAgentTool, toolPayloadJson } from "./agent-tools.ts";
import {
  checkCompareCongestion,
  checkNewEnglandRanking,
  checkOffThesisRefusal,
  checkParisRefusal,
} from "./citation-check.ts";
import { ACCEPTED_PLACE_PHRASES, OFF_THESIS_REFUSAL, unknownPlaceRefusal } from "./refusals.ts";
import { assistantMessage, type ToolCall } from "./thread-messages.ts";

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

function queryTool(args: Record<string, unknown>): ToolCall {
  return {
    tool: "queryAirports",
    args,
    result: toolPayloadJson(runAgentTool("queryAirports", args)),
    durationMs: 5,
  };
}

const compareRanking = queryTool({ iata: ["SNA", "LAX"] });
const compareLookup = queryTool({ iata: ["LAX", "SNA"], metric: "congestion" });
const laxRow = runAgentTool("queryAirports", { iata: "LAX" }).rows[0];
const snaRow = runAgentTool("queryAirports", { iata: "SNA" }).rows[0];
assert.ok(laxRow && snaRow);

test("a two-code ranking of LAX and SNA passes the compare checker", () => {
  const verdict = checkCompareCongestion(
    assistantMessage(
      `${laxRow.iata} congestion is ${laxRow.scoreVector.congestion.raw}; ${snaRow.iata} is ${snaRow.scoreVector.congestion.raw}.`,
      [compareRanking],
    ),
  );
  assert.equal(verdict.ok, true, verdict.reason);
});

test("a two-code congestion lookup of LAX and SNA passes the compare checker", () => {
  const verdict = checkCompareCongestion(
    assistantMessage(
      `${laxRow.iata} congestion is ${laxRow.scoreVector.congestion.raw}; ${snaRow.iata} is ${snaRow.scoreVector.congestion.raw}.`,
      [compareLookup, methodology],
    ),
  );
  assert.equal(verdict.ok, true, verdict.reason);
});

test("a municipality-only Los Angeles query fails the compare checker", () => {
  const verdict = checkCompareCongestion(
    assistantMessage("Los Angeles is one airport.", [queryTool({ municipality: "Los Angeles" })]),
  );
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /municipality|LAX|SNA/i);
});

test("a compare that drops SNA fails", () => {
  const verdict = checkCompareCongestion(
    assistantMessage(`${laxRow.iata} congestion is ${laxRow.scoreVector.congestion.raw}.`, [
      queryTool({ iata: "LAX" }),
    ]),
  );
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /SNA/);
});

test("an invented IATA on a compare answer fails the citation checker", () => {
  const verdict = checkCompareCongestion(
    assistantMessage(`${laxRow.iata} and ${snaRow.iata} compared; CDG is not in the set.`, [
      compareRanking,
    ]),
  );
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /CDG/);
});

test("the ROI refusal is the locked copy with no tools", () => {
  assert.equal(checkOffThesisRefusal(assistantMessage(OFF_THESIS_REFUSAL)).ok, true);
  assert.equal(
    checkOffThesisRefusal(assistantMessage(`Lead-in. ${OFF_THESIS_REFUSAL}`)).ok,
    true,
    "the locked paragraph may sit inside the prose",
  );
  assert.equal(
    checkOffThesisRefusal(assistantMessage(OFF_THESIS_REFUSAL, [compareRanking])).ok,
    false,
    "any tool call fails",
  );
  assert.equal(
    checkOffThesisRefusal(assistantMessage("ROI is outside this screen.")).ok,
    false,
    "a paraphrase is not the locked copy",
  );
});

const parisUnknown = queryTool({ municipality: "Paris" });
const parisRefusal = unknownPlaceRefusal(
  (parisUnknown.result as { unknownPlace: { field: string; value: string }[] }).unknownPlace,
);
assert.ok(parisRefusal);

const noToolParis = [
  "Paris did not resolve and the phrase was not geocoded.",
  `Ask again with ${ACCEPTED_PLACE_PHRASES.join(", ")}.`,
].join(" ");

test("Paris may refuse with no tools, accepted phrases, and a did-not-resolve claim", () => {
  const verdict = checkParisRefusal(assistantMessage(noToolParis));
  assert.equal(verdict.ok, true, verdict.reason);
});

test("Paris may refuse after queryAirports returns unknownPlace and empty rows", () => {
  const verdict = checkParisRefusal(assistantMessage(parisRefusal, [parisUnknown]));
  assert.equal(verdict.ok, true, verdict.reason);
});

test("invented CDG on a tool-using Paris answer fails the citation checker", () => {
  const verdict = checkParisRefusal(
    assistantMessage(`${parisRefusal} CDG would be the guess.`, [parisUnknown]),
  );
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /CDG/);
});

test("a no-tool Paris answer that geocodes or skips accepted phrases fails", () => {
  assert.equal(
    checkParisRefusal(assistantMessage("Paris did not resolve. The phrase was not geocoded.")).ok,
    false,
    "accepted phrases missing",
  );
  assert.equal(
    checkParisRefusal(
      assistantMessage(`Paris maps to CDG. Ask again with ${ACCEPTED_PLACE_PHRASES.join(", ")}.`),
    ).ok,
    false,
    "invented CDG / missing not-geocoded claim",
  );
});
