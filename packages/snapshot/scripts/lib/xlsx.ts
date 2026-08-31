import { readZipEntry } from "./zip.ts";

function readSharedStrings(workbook: Buffer): string[] {
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
// table, not a spreadsheet engine. Each row is its cell text by column letter.
export function readWorksheetRows(workbook: Buffer): Map<string, string>[] {
  const strings = readSharedStrings(workbook);
  const sheet = readZipEntry(workbook, (name) =>
    /xl\/worksheets\/sheet1\.xml$/.test(name),
  ).toString("utf8");
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells = new Map<string, string>();
    // Cells are either paired or self-closing; the alternation keeps an empty
    // cell from swallowing the value of the next one.
    for (const cell of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const raw = /<v>([\s\S]*?)<\/v>/.exec(cell[3] ?? "")?.[1] ?? "";
      const isSharedString = /t="s"/.test(cell[2]);
      cells.set(cell[1], decodeXmlText(isSharedString ? (strings[Number(raw)] ?? "") : raw));
    }
    return cells;
  });
}
