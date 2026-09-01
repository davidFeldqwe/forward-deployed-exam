/**
 * Copy and CSV of a ranking table (issue #30 / PRD stories 33-35): the same
 * columns the table draws, serialized from the `queryAirports` payload rather
 * than from styled cell text. Composite is the number the screen computed, or
 * empty where it withheld one — never a "/100" suffix, never a fake zero.
 *
 * The columns are IATA, name, composite, candidate lamp, why-labels. Operating
 * profit, HHI, Form 127, net revenue and "opportunity score" are not fields the
 * screen carries, and they are not invented here so a sheet cannot grow them.
 */
import { WITHHELD_COMPOSITE, type RankingRowView } from "./ranking-view.ts";

export const rankingExport = {
  copyLabel: "Copy",
  copiedLabel: "Copied",
  csvLabel: "CSV",
  csvFileName: "ranking.csv",
} as const;

const COLUMNS = ["IATA", "Name", "Composite", "Candidate lamp", "Why-labels"] as const;

/** Tab-separated ranking columns, for the clipboard. */
export function rankingTableTsv(rows: readonly RankingRowView[]): string {
  return table(rows, "\t", identity);
}

/** Comma-separated ranking columns, for the download. */
export function rankingTableCsv(rows: readonly RankingRowView[]): string {
  return table(rows, ",", csvField);
}

function table(
  rows: readonly RankingRowView[],
  delimiter: string,
  encode: (value: string) => string,
): string {
  return [[...COLUMNS], ...rows.map(cells)].map((line) => line.map(encode).join(delimiter)).join("\n");
}

function cells(row: RankingRowView): string[] {
  return [
    row.iata,
    row.name,
    compositeCell(row.composite),
    row.lamp ?? "",
    row.whyLabels.join("; "),
  ];
}

/**
 * The payload's composite, as a cell. The table prints `WITHHELD_COMPOSITE`
 * where the screen withheld a number; that mark is styled text, so the export
 * leaves the cell empty instead.
 */
function compositeCell(composite: RankingRowView["composite"]): string {
  if (composite === null || composite === WITHHELD_COMPOSITE) {
    return "";
  }
  return composite;
}

function identity(value: string): string {
  return value;
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
