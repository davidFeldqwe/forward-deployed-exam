import snapshotJson from "../data/us-airports-snapshot.json" with { type: "json" };

import { airportSnapshotSchema, type AirportSnapshot } from "./schema.ts";

export {
  CENSUS_DIVISIONS,
  censusDivisionOf,
  type CensusDivision,
} from "./census-divisions.ts";
export {
  SLOT_LIMITS,
  SLOT_LIMIT_VERIFIED_ON,
  slotLimitOf,
  type SlotLimit,
} from "./slot-limits.ts";
export {
  airportSnapshotSchema,
  // The peer-group enum itself, so the agent's tool schema validates a hub size
  // against the snapshot's own list rather than re-typing the three names.
  peerGroupSchema,
  type AirportSnapshot,
  type Coverage,
  type PeerGroup,
  type SnapshotAirport,
} from "./schema.ts";

let parsed: AirportSnapshot | null = null;

// Reads the committed snapshot only: a fresh clone needs no live FAA or BTS HTTP.
export function loadSnapshot(): AirportSnapshot {
  parsed ??= airportSnapshotSchema.parse(snapshotJson);
  return parsed;
}
