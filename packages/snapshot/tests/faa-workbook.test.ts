import assert from "node:assert/strict";
import { test } from "node:test";

import { FAA_HUB_LETTERS, readFaaUniverse } from "../scripts/lib/faa-workbook.ts";
import { peerGroupSchema } from "../src/schema.ts";

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
  const universe = readFaaUniverse(sheet(HEADER, [ATL, DFW]), WINDOW);
  assert.deepEqual(universe, [
    {
      locid: "ATL",
      peerGroup: "large",
      state: "GA",
      enplanements: { firstYear: 50950068, secondYear: 52511402 },
    },
    {
      locid: "DFW",
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
  );
  assert.deepEqual(universe[0]?.enplanements, { firstYear: 50950068, secondYear: 52511402 });
});

test("a workbook without both comparison-window years is refused, not read anyway", () => {
  const stale = HEADER.map((column) => (column === "CY 23 Enplanements" ? "CY 19 Enplanements" : column));
  assert.throws(() => readFaaUniverse(sheet(stale, [ATL]), WINDOW), /2023/);
});

test("rows that are not ranked three-letter airports drop out of the universe", () => {
  const subtotal = ["", "", "", "", "Total", "", "", "", "92000000", "90000000", ""];
  const fourLetterLocid = ["3", "SO", "FL", "MCO2", "Orlando", "Orlando Intl", "P", "L", "1", "1", ""];
  const universe = readFaaUniverse(sheet(HEADER, [ATL, subtotal, fourLetterLocid, DFW]), WINDOW);
  assert.deepEqual(universe.map((row) => row.locid), ["ATL", "DFW"]);
});

// #73: the universe is the FAA's primary line, not a top-N cut, so a row is kept
// for its hub size and its rank only says it is a ranked row at all.
test("every primary hub size is kept, however far down the ranked list it sits", () => {
  const rows = [
    ATL,
    ["2", "SW", "TX", "DFW", "Fort Worth", "DFW Intl", "P", "M", "42351316", "39246212", "0.08"],
    ["300", "NE", "ME", "PWM", "Portland", "Portland Jetport", "P", "S", "1000000", "900000", ""],
    ["500", "NE", "ME", "BGR", "Bangor", "Bangor Intl", "P", "N", "140400", "130000", "0.08"],
  ];
  const universe = readFaaUniverse(sheet(HEADER, rows), WINDOW);
  assert.deepEqual(
    universe.map((row) => [row.locid, row.peerGroup]),
    [["ATL", "large"], ["DFW", "medium"], ["PWM", "small"], ["BGR", "nonhub"]],
  );
});

// The same ranked list carries the nonprimary commercial-service airports the
// FAA files under no hub size at all. Those are out of the primary universe, so
// they are skipped rather than thrown as a hub letter this reader cannot read.
test("a nonprimary commercial-service row is passed over, not refused", () => {
  const kiana = ["560", "AL", "AK", "IAN", "Kiana", "Bob Baker Memorial", "CS", "None", "2555", "2759", ""];
  const universe = readFaaUniverse(sheet(HEADER, [ATL, kiana, DFW]), WINDOW);
  assert.deepEqual(universe.map((row) => row.locid), ["ATL", "DFW"]);
});

// #70: N is the FAA's fourth hub size for a primary commercial airport, so the
// reader stores it as the `nonhub` peer group rather than throwing on the row.
test("hub N is read as the nonhub peer group, the fourth FAA hub size", () => {
  const bgr = ["2", "NE", "ME", "BGR", "Bangor", "Bangor Intl", "P", "N", "140400", "130000", "0.08"];
  const universe = readFaaUniverse(sheet(HEADER, [ATL, bgr]), WINDOW);
  assert.deepEqual(
    universe.map((row) => [row.locid, row.peerGroup]),
    [
      ["ATL", "large"],
      ["BGR", "nonhub"],
    ],
  );
});

// #70: the letter for each hub size is keyed off `PeerGroup`, so a fifth peer
// group in the snapshot schema fails this reader's typecheck rather than being
// refused row by row at ingest. This is the runtime half of that pin: every hub
// size the schema accepts has a letter, and that letter really is read back as
// the hub size it stands for — two sharing one letter fails here too.
test("every peer group the snapshot accepts is an FAA hub size this reader reads", () => {
  for (const peerGroup of peerGroupSchema.options) {
    const row = [...ATL];
    row[HEADER.indexOf("Hub")] = FAA_HUB_LETTERS[peerGroup];
    const universe = readFaaUniverse(sheet(HEADER, [row]), WINDOW);
    assert.equal(universe[0]?.peerGroup, peerGroup);
  }
});

test("an unreadable hub size and an empty universe both fail loudly", () => {
  const unknownHub = [...DFW];
  unknownHub[HEADER.indexOf("Hub")] = "X";
  assert.throws(() => readFaaUniverse(sheet(HEADER, [ATL, unknownHub]), WINDOW), /hub size/i);
  assert.throws(() => readFaaUniverse(sheet(HEADER, []), WINDOW), /no ranked primary/);
});
