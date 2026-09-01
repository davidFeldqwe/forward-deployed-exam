import { peerGroupSchema, type PeerGroup } from "../../src/schema.ts";

export type FaaUniverseRow = {
  iata: string;
  peerGroup: PeerGroup;
  state: string;
  enplanements: { firstYear: number; secondYear: number };
};

/**
 * The FAA's hub-size letter for each peer group. N is the fourth: a nonhub
 * primary, under 0.05% of national enplanements and still scheduled service, so
 * the row is read rather than refused. Keyed off `PeerGroup`, so a fifth hub
 * size fails to typecheck here rather than reaching ingest as a letter no case
 * claims — which reads as a workbook this module cannot parse, not as a hub size
 * it was never given.
 */
export const FAA_HUB_LETTERS: Readonly<Record<PeerGroup, string>> = {
  large: "L",
  medium: "M",
  small: "S",
  nonhub: "N",
};

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
 * The ranked universe from the FAA ACAIS commercial-service enplanement
 * workbook: `size` rows keyed by IATA, each carrying both comparison-window
 * years. Pure over the worksheet so the header contract is testable without a
 * download.
 */
export function readFaaUniverse(
  rows: readonly Row[],
  window: { firstYear: number; secondYear: number },
  size: number,
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
    // identifier is not an IATA code, so neither joins into the universe.
    if (!Number.isInteger(rank) || rank < 1 || rank > size || !/^[A-Z]{3}$/.test(locid)) {
      continue;
    }
    const hub = cell(row, columns.hubSize);
    const peerGroup = PEER_GROUP_BY_FAA_HUB.get(hub);
    if (!peerGroup) {
      throw new Error(`FAA hub size ${hub || "(blank)"} at rank ${rank} is not a peer group`);
    }
    universe.push({
      iata: locid,
      peerGroup,
      state: cell(row, columns.state).toUpperCase(),
      enplanements: {
        secondYear: Number(cell(row, columns.secondYearEnplanements)),
        firstYear: Number(cell(row, columns.firstYearEnplanements)),
      },
    });
  }
  if (universe.length !== size) {
    throw new Error(`expected ${size} ranked airports, read ${universe.length}`);
  }
  return universe;
}
