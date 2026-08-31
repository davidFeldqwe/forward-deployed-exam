import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const cacheDir =
  process.env.INGEST_CACHE_DIR ?? join(import.meta.dirname, "..", "..", ".cache");

// Rebuild-only download cache. Nothing here ships: the committed snapshot is
// what a fresh clone reads, and a second ingest run reuses these files.
export async function download(url: string, filename: string): Promise<Buffer> {
  mkdirSync(cacheDir, { recursive: true });
  const path = join(cacheDir, filename);
  if (existsSync(path)) {
    return readFileSync(path);
  }
  process.stdout.write(`downloading ${url}\n`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  writeFileSync(path, body);
  return body;
}
