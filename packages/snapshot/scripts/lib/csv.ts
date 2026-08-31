const COMMA = 0x2c;
const QUOTE = 0x22;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;

function decodeField(buffer: Buffer, start: number, end: number): string {
  if (end > start && buffer[start] === QUOTE && buffer[end - 1] === QUOTE) {
    return buffer.toString("utf8", start + 1, end - 1).replaceAll('""', '"');
  }
  return buffer.toString("utf8", start, end);
}

function trimCarriageReturn(buffer: Buffer, start: number, end: number): number {
  return end > start && buffer[end - 1] === CARRIAGE_RETURN ? end - 1 : end;
}

function splitFirstRecord(buffer: Buffer): string[] {
  const lineFeed = buffer.indexOf(LINE_FEED);
  const end = trimCarriageReturn(buffer, 0, lineFeed < 0 ? buffer.length : lineFeed);
  const fields: string[] = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index <= end; index += 1) {
    const byte = index < end ? buffer[index] : COMMA;
    if (byte === QUOTE) {
      quoted = !quoted;
    } else if (byte === COMMA && !quoted) {
      fields.push(decodeField(buffer, start, index));
      start = index + 1;
    }
  }
  return fields;
}

// Walks a whole CSV buffer once and hands the callback only the requested
// columns, so a 250 MB BTS extract never becomes 100 strings per row. The values
// array is reused between rows: read it inside the callback, do not keep it.
export function forEachCsvRow(
  buffer: Buffer,
  columns: readonly string[],
  onRow: (values: readonly string[]) => void,
): void {
  const header = splitFirstRecord(buffer);
  const positionByFieldIndex = header.map(() => -1);
  columns.forEach((column, position) => {
    const fieldIndex = header.indexOf(column);
    if (fieldIndex < 0) {
      throw new Error(`column ${column} is missing from the CSV header`);
    }
    positionByFieldIndex[fieldIndex] = position;
  });

  const values: string[] = columns.map(() => "");
  const lineFeed = buffer.indexOf(LINE_FEED);
  let fieldStart = lineFeed < 0 ? buffer.length : lineFeed + 1;
  let fieldIndex = 0;
  let quoted = false;

  const endField = (end: number) => {
    const position = positionByFieldIndex[fieldIndex] ?? -1;
    if (position >= 0) {
      values[position] = decodeField(buffer, fieldStart, trimCarriageReturn(buffer, fieldStart, end));
    }
    fieldStart = end + 1;
    fieldIndex += 1;
  };

  for (let index = fieldStart; index < buffer.length; index += 1) {
    const byte = buffer[index];
    if (byte === QUOTE) {
      quoted = !quoted;
    } else if (quoted) {
      continue;
    } else if (byte === COMMA) {
      endField(index);
    } else if (byte === LINE_FEED) {
      const blankLine =
        fieldIndex === 0 && trimCarriageReturn(buffer, fieldStart, index) === fieldStart;
      if (!blankLine) {
        endField(index);
        onRow(values);
      }
      fieldStart = index + 1;
      fieldIndex = 0;
      values.fill("");
    }
  }
  if (fieldStart < buffer.length) {
    endField(buffer.length);
    onRow(values);
  }
}
