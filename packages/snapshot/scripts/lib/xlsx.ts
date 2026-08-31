import { readZipEntry } from "./zip.ts";

type Cell = { column: string; value: string };

function sharedStrings(workbook: Buffer): string[] {
  const xml = readZipEntry(workbook, (name) => name.endsWith("sharedStrings.xml")).toString("utf8");
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((entry) =>
    [...entry[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((text) => text[1]).join(""),
  );
}

function decodeXmlText(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

// Minimal reader for the one-sheet FAA workbooks: enough to pull a rectangular
// table, not a spreadsheet engine.
export function readWorksheetRows(workbook: Buffer): Map<string, string>[] {
  const strings = sharedStrings(workbook);
  const sheet = readZipEntry(workbook, (name) =>
    /xl\/worksheets\/sheet1\.xml$/.test(name),
  ).toString("utf8");
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    // Cells are either paired or self-closing; the alternation keeps an empty
    // cell from swallowing the value of the next one.
    const cells: Cell[] = [
      ...row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g),
    ].map(
      (cell) => {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(cell[3] ?? "")?.[1] ?? "";
        const isSharedString = /t="s"/.test(cell[2]);
        return {
          column: cell[1],
          value: decodeXmlText(isSharedString ? (strings[Number(raw)] ?? "") : raw),
        };
      },
    );
    return new Map(cells.map((cell) => [cell.column, cell.value]));
  });
}
