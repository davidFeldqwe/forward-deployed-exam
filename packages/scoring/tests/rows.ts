import assert from "node:assert/strict";

import type { ScoredAirport } from "../src/index.ts";

/**
 * An IATA lookup over a scored universe, for tests that assert on named
 * airports. A code that is not there fails on the code itself rather than
 * handing back `undefined` for a later assertion to trip over.
 */
export function rowLookup(scored: readonly ScoredAirport[]): (iata: string) => ScoredAirport {
  const byIata = new Map(scored.map((row) => [row.iata, row]));
  return (iata) => {
    const found = byIata.get(iata);
    assert.ok(found, `${iata} is in the scored universe`);
    return found;
  };
}
