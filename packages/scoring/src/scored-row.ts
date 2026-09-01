import {
  CANDIDATE_LAMPS,
  COMPONENTS,
  type Coverage,
  type ScoredAirport,
} from "./types.ts";

/**
 * Is this JSON one of the rows this module scored? The Thread store is the
 * caller: a message comes back from its store as a document nothing validated,
 * and the message list is the only source a stored answer re-renders from, so a
 * row that lost its lamp or its name would draw a blank cell rather than fail
 * the read.
 *
 * The check lives here because the shape is this module's. A store that listed
 * the fields itself is a second copy of `ScoredAirport`, free to drift from this
 * one — and free to be *stricter* than the snapshot, which is how a territory
 * airport with no Census division stopped being storable.
 */
export function isScoredAirport(value: unknown): value is ScoredAirport {
  return (
    isRecord(value) &&
    Object.entries(FIELD_CHECKS).every(([field, check]) => check(value[field])) &&
    isCoordinatePair(value)
  );
}

/**
 * A check for one of a closed set of labels, spelled as every label of the type
 * it closes over: a fifth FAA hub size or a third slot level fails this
 * typecheck rather than being refused at a store boundary that never heard of
 * it. The sets are written out here because this module reads `@repo/snapshot`
 * for types only — nothing of it loads at runtime.
 */
function isLabelIn<Label extends string>(
  labels: Readonly<Record<Label, true>>,
): (value: unknown) => boolean {
  return (value) => typeof value === "string" && Object.hasOwn(labels, value);
}

const isPeerGroup = isLabelIn<ScoredAirport["peerGroup"]>({
  large: true,
  medium: true,
  small: true,
  nonhub: true,
});

const isSlotLevel = isLabelIn<NonNullable<ScoredAirport["slotLimit"]>>({
  "Level 2": true,
  "Level 3": true,
});

const isCoverage = isLabelIn<Coverage>({ present: true, missing: true });

/**
 * Every field of a scored row, with the check it has to pass. The map is typed
 * over `keyof ScoredAirport`, so a field added to the row fails this typecheck
 * until someone says how it is checked: a value the answer objects draw that
 * nothing checks is a blank cell or a dropped caveat, not a refused write.
 *
 * The checks are the row's own rules and no tighter. `region` is null for an
 * airport the Census Bureau files under no division, and the fields the
 * snapshot passes through are checked for being there, not re-validated: ingest
 * is where a state is two letters.
 */
const FIELD_CHECKS: {
  [Field in keyof ScoredAirport]: (value: unknown) => boolean;
} = {
  iata: isNonEmptyString,
  name: isNonEmptyString,
  municipality: isString,
  state: isNonEmptyString,
  region: isRegion,
  latitude: isDegrees(90),
  longitude: isDegrees(180),
  peerGroup: isPeerGroup,
  scoreVector: isScoreVector,
  composite: isNumberOrNull,
  candidateLamp: isLamp,
  slotLimit: isSlotLimit,
  longHaulShare: isNumberOrNull,
  assumptions: isStringArray,
  gaps: isStringArray,
};

/** A slot limit, or none: an airport under no FAA schedule constraint. */
function isSlotLimit(value: unknown): boolean {
  return value === null || isSlotLevel(value);
}

/** A Census division, or none: the Bureau files no territory under one. */
function isRegion(value: unknown): boolean {
  return value === null || isNonEmptyString(value);
}

function isLamp(value: unknown): boolean {
  return CANDIDATE_LAMPS.some((lamp) => lamp === value);
}

/**
 * A coordinate the snapshot could carry: degrees, or none. The bound is checked
 * because a stored row is JSON that has been outside this process — an
 * off-world number would put a map marker somewhere the airport is not.
 */
function isDegrees(bound: number): (value: unknown) => boolean {
  return (value) =>
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= bound);
}

/**
 * The snapshot's rule, re-checked because a stored row reaches this check
 * without passing `scoreUniverse`: a coordinate is a pair, and half of one is
 * not a point to draw. An airport the source does not locate keeps both nulls
 * and is a scored row anyway.
 */
function isCoordinatePair(row: Record<string, unknown>): boolean {
  return (row.latitude === null) === (row.longitude === null);
}

function isScoreVector(value: unknown): boolean {
  return (
    isRecord(value) && COMPONENTS.every((component) => isScoreComponent(value[component]))
  );
}

function isScoreComponent(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumberOrNull(value.percentile) &&
    isNumberOrNull(value.raw) &&
    isCoverage(value.coverage)
  );
}

function isString(value: unknown): boolean {
  return typeof value === "string";
}

/** A drawn label: a blank one is a hole in the row, not a value. */
function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(isString);
}

function isNumberOrNull(value: unknown): boolean {
  return value === null || typeof value === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
