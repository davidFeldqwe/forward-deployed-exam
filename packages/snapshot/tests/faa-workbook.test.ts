import assert from "node:assert/strict";
import { test } from "node:test";

import { readFaaUniverse } from "../scripts/lib/faa-workbook.ts";

const WINDOW = { firstYear: 2023, secondYear: 2024 } as const;

// The header labels and row shapes of arp-cy2024-commercial-service-enplanements.xlsx.
const HEADER = [
  "Rank",
  "RO",
  "ST",
  "Locid",
  "City",
  "Airport Name",
  "S/L",
  "Hub",
  "CY 24 Enplanements",
  "CY 23 Enplanements",
  "% Change",
];

function sheet(header: readonly string[], rows: readonly (readonly string[])[]) {
  const letter = (index: number) => String.fromCharCode(65 + index);
  return [header, ...rows].map(
    (row) => new Map(row.map((value, index) => [letter(index), value])),
  );
}

const ATL = ["1", "SO", "GA", "ATL", "Atlanta", "Hartsfield", "P", "L", "52511402", "50950068", "0.03"];
const DFW = ["2", "SW", "TX", "DFW", "Fort Worth", "DFW Intl", "P", "L", "42351316", "39246212", "0.08"];

test("the universe is the ranked IATA rows, read by header label", () => {
  const universe = readFaaUniverse(sheet(HEADER, [ATL, DFW]), WINDOW, 2);
  assert.deepEqual(universe, [
    {
      iata: "ATL",
      peerGroup: "large",
      state: "GA",
      enplanements: { firstYear: 50950068, secondYear: 52511402 },
    },
    {
      iata: "DFW",
      peerGroup: "large",
      state: "TX",
      enplanements: { firstYear: 39246212, secondYear: 42351316 },
    },
  ]);
});

test("a re-laid-out workbook still reads, because columns are found by label", () => {
  const reordered = ["Hub", "Locid", "ST", "CY 23 Enplanements", "CY 24 Enplanements", "Rank"];
  const universe = readFaaUniverse(
    [
      new Map([["A", "FAA ACAIS calendar year enplanements"]]),
      ...sheet(reordered, [["L", "ATL", "GA", "50950068", "52511402", "1"]]),
    ],
    WINDOW,
    1,
  );
  assert.deepEqual(universe[0]?.enplanements, { firstYear: 50950068, secondYear: 52511402 });
});

test("a workbook without both comparison-window years is refused, not read anyway", () => {
  const stale = HEADER.map((column) => (column === "CY 23 Enplanements" ? "CY 19 Enplanements" : column));
  assert.throws(() => readFaaUniverse(sheet(stale, [ATL]), WINDOW, 1), /2023/);
});

test("rows that are not ranked IATA airports drop out of the universe", () => {
  const subtotal = ["", "", "", "", "Total", "", "", "", "92000000", "90000000", ""];
  const fourLetterLocid = ["3", "SO", "FL", "MCO2", "Orlando", "Orlando Intl", "P", "L", "1", "1", ""];
  const belowRank = ["3", "SO", "FL", "MCO", "Orlando", "Orlando Intl", "P", "L", "1", "1", ""];
  const universe = readFaaUniverse(sheet(HEADER, [ATL, subtotal, fourLetterLocid, DFW, belowRank]), WINDOW, 2);
  assert.deepEqual(universe.map((row) => row.iata), ["ATL", "DFW"]);
});

// #70: N is the FAA's fourth hub size for a primary commercial airport, so the
// reader stores it as the `nonhub` peer group rather than throwing on the row.
test("hub N is read as the nonhub peer group, the fourth FAA hub size", () => {
  const bgr = ["2", "NE", "ME", "BGR", "Bangor", "Bangor Intl", "P", "N", "140400", "130000", "0.08"];
  const universe = readFaaUniverse(sheet(HEADER, [ATL, bgr]), WINDOW, 2);
  assert.deepEqual(
    universe.map((row) => [row.iata, row.peerGroup]),
    [
      ["ATL", "large"],
      ["BGR", "nonhub"],
    ],
  );
});

test("an unreadable hub size and a short universe both fail loudly", () => {
  const unknownHub = [...DFW];
  unknownHub[HEADER.indexOf("Hub")] = "X";
  assert.throws(() => readFaaUniverse(sheet(HEADER, [ATL, unknownHub]), WINDOW, 2), /hub size/i);
  assert.throws(() => readFaaUniverse(sheet(HEADER, [ATL]), WINDOW, 2), /expected 2/);
});
