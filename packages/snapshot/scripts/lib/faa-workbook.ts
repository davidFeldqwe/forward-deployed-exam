import { peerGroupSchema, type PeerGroup } from "../../src/schema.ts";

export type FaaUniverseRow = {
  /** The FAA location identifier, which is not always the IATA code. */
  locid: string;
  peerGroup: PeerGroup;
  state: string;
  enplanements: { firstYear: number; secondYear: number };
};

/**
 * The FAA's hub-size letter for each peer group. N is the fourth: a nonhub
 * primary, under 0.05% of national enplanements and still scheduled service, so
 * the row is read rather than refused. Keyed off `PeerGroup`, so a fifth hub
 * size fails to typecheck here rather than reaching ingest with no letter of its
 * own, where every row carrying it would be thrown as a workbook this module
 * cannot parse.
 */
export const FAA_HUB_LETTERS: Readonly<Record<PeerGroup, string>> = {
  large: "L",
  medium: "M",
  small: "S",
  nonhub: "N",
};

/**
 * What ACAIS writes in the hub column for a commercial-service airport that is
 * not a primary — under 10,000 annual enplanements. Those rows are in the same
 * ranked list as the primaries and are not part of this universe, so they are
 * skipped rather than thrown: a hub letter nobody publishes is a changed
 * workbook, a nonprimary row is just a nonprimary row.
 */
const FAA_NONPRIMARY_HUB = "None";

// Read the other way round, because the workbook gives a letter and the universe
// stores a peer group. A letter no hub size claims has no entry, which is the
// row `readFaaUniverse` refuses.
const PEER_GROUP_BY_FAA_HUB = new Map<string, PeerGroup>(
  peerGroupSchema.options.map((peerGroup) => [FAA_HUB_LETTERS[peerGroup], peerGroup]),
);

type Columns = {
  rank: string;
  state: string;
  locid: string;
  hubSize: string;
  firstYearEnplanements: string;
  secondYearEnplanements: string;
};

type Row = ReadonlyMap<string, string>;

function label(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

// "CY 24 Enplanements" in the CY2024 release, "CY 2024 Enplanements" in others.
function enplanementYear(text: string): number | null {
  const match = /^CY ?(\d{2}|\d{4}) ENPLANEMENTS$/.exec(text);
  if (!match) {
    return null;
  }
  const digits = match[1] ?? "";
  return digits.length === 4 ? Number(digits) : 2000 + Number(digits);
}

function columnWhere(row: Row, matches: (text: string) => boolean): string | null {
  const found = [...row].filter(([, value]) => matches(label(value))).map(([letter]) => letter);
  return found.length === 1 ? (found[0] ?? null) : null;
}

// The FAA re-lays out the ACAIS workbook between releases and puts the two-digit
// calendar year in the enplanement headers, so the column letters are read off
// the header row rather than pinned. A header that does not carry both window
// years is a different workbook, not this one.
function resolveColumns(
  row: Row,
  window: { firstYear: number; secondYear: number },
): Columns | null {
  const columns = {
    rank: columnWhere(row, (text) => text === "RANK"),
    state: columnWhere(row, (text) => text === "ST"),
    locid: columnWhere(row, (text) => text === "LOCID"),
    hubSize: columnWhere(row, (text) => text === "HUB"),
    firstYearEnplanements: columnWhere(
      row,
      (text) => enplanementYear(text) === window.firstYear,
    ),
    secondYearEnplanements: columnWhere(
      row,
      (text) => enplanementYear(text) === window.secondYear,
    ),
  };
  return Object.values(columns).every((letter) => letter !== null)
    ? (columns as Columns)
    : null;
}

function cell(row: Row, column: string): string {
  return (row.get(column) ?? "").trim();
}

/**
 * The primary-commercial universe from the FAA ACAIS enplanement workbook:
 * every three-letter locid the FAA files under one of its four hub sizes, each
 * row carrying both comparison-window years. That line is the FAA's own, not a
 * top-N cut, so the count moves with the release. Pure over the worksheet so
 * the header contract is testable without a download.
 */
export function readFaaUniverse(
  rows: readonly Row[],
  window: { firstYear: number; secondYear: number },
): FaaUniverseRow[] {
  const headerIndex = rows.findIndex((row) => resolveColumns(row, window) !== null);
  const columns = headerIndex < 0 ? null : resolveColumns(rows[headerIndex] as Row, window);
  if (!columns) {
    throw new Error(
      `no FAA header row carries rank, state, locid, hub and enplanements for ${window.firstYear} and ${window.secondYear}`,
    );
  }

  const universe: FaaUniverseRow[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const rank = Number(cell(row, columns.rank));
    const locid = cell(row, columns.locid).toUpperCase();
    // Subtotal rows carry a count but no rank, and a four-character FAA location
    // identifier joins to nothing the snapshot keys on, so neither is a row here.
    if (!Number.isInteger(rank) || rank < 1 || !/^[A-Z]{3}$/.test(locid)) {
      continue;
    }
    const hub = cell(row, columns.hubSize);
    if (hub === FAA_NONPRIMARY_HUB) {
      continue;
    }
    const peerGroup = PEER_GROUP_BY_FAA_HUB.get(hub);
    if (!peerGroup) {
      throw new Error(`FAA hub size ${hub || "(blank)"} at rank ${rank} is not a peer group`);
    }
    universe.push({
      locid,
      peerGroup,
      state: cell(row, columns.state).toUpperCase(),
      enplanements: {
        secondYear: Number(cell(row, columns.secondYearEnplanements)),
        firstYear: Number(cell(row, columns.firstYearEnplanements)),
      },
    });
  }
  if (universe.length === 0) {
    throw new Error("the FAA workbook carries no ranked primary airports");
  }
  return universe;
}
