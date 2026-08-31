import { inflateRawSync } from "node:zlib";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;

type CentralEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function findEndOfCentralDirectory(zip: Buffer): number {
  // The comment field is variable length, so the record is found by scanning back.
  for (let offset = zip.length - 22; offset >= 0; offset -= 1) {
    if (zip.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  throw new Error("not a zip archive: no end-of-central-directory record");
}

function readCentralDirectory(zip: Buffer): CentralEntry[] {
  const end = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const entries: CentralEntry[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(offset) !== CENTRAL_FILE_HEADER) {
      throw new Error(`corrupt central directory at offset ${offset}`);
    }
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    entries.push({
      name: zip.toString("utf8", offset + 46, offset + 46 + nameLength),
      compressionMethod: zip.readUInt16LE(offset + 10),
      compressedSize: zip.readUInt32LE(offset + 20),
      localHeaderOffset: zip.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// Reads one archive member. Deflate and stored are the only methods BTS and FAA
// use, so anything else is a source change worth failing on.
export function readZipEntry(zip: Buffer, matches: (name: string) => boolean): Buffer {
  const entry = readCentralDirectory(zip).find((candidate) => matches(candidate.name));
  if (!entry) {
    throw new Error("no matching entry in zip archive");
  }
  const nameLength = zip.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = zip.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const data = zip.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compressionMethod === 0) {
    return data;
  }
  if (entry.compressionMethod === 8) {
    return inflateRawSync(data, { maxOutputLength: 1_500_000_000 });
  }
  throw new Error(`unsupported zip compression method ${entry.compressionMethod}`);
}
