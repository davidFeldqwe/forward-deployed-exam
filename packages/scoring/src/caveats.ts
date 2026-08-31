// Caveats ride on the row, not in a global footer: the answer that shows a
// number shows the assumptions behind that number.
import type { AirportSnapshot, SnapshotAirport } from "@repo/snapshot";

import { COMPONENTS, COMPONENT_LABELS } from "./types.ts";
import { WEIGHTS } from "./weights.ts";

const OUT_OF_SCOPE =
  "Construction cost, ROI, land availability, politics, and airline leases are outside this capacity-pressure screen.";

/**
 * The caveats every row in one snapshot carries. Built once per snapshot and
 * handed to `assumptionsFor`, so a hundred rows do not re-derive the same lines.
 */
export function sharedAssumptions(snapshot: AirportSnapshot): string[] {
  const { firstYear, secondYear } = snapshot.comparisonWindow;
  const { units, longHaulShare } = snapshot.methodology;
  return [
    `Comparison window is ${firstYear}-${secondYear}; every airport is measured on the same two calendar years.`,
    "Percentiles, and the composite built from them, are within the airport's FAA hub-size peer group, computed nationally: a small-hub composite of 87 is a rank among small hubs, not a claim that it is under more pressure than a large hub at 50. A place question filters these rows, it does not re-percentile them.",
    `Weights are fixed: congestion ${WEIGHTS.congestion}, unmet flight demand ${WEIGHTS.unmetFlightDemand}, delay ${WEIGHTS.delay}, growth ${WEIGHTS.growth}.`,
    `Congestion is ${units.congestion}; unmet flight demand is ${units.unmetFlightDemand}; delay is ${units.delay}; growth is ${units.growth}.`,
    `Long-haul share is a lookup over ${longHaulShare.basis} beyond ${longHaulShare.thresholdMiles} miles, not a score-vector component.`,
    "A missing input is never zero-filled and the remaining components are never re-weighted, so an airport missing any component has no composite.",
    OUT_OF_SCOPE,
  ];
}

/**
 * One row's assumptions: the snapshot-wide lines, plus a note naming the blanks
 * when the row is missing an input, so the withheld composite is read as absent
 * data rather than a low score.
 */
export function assumptionsFor(shared: readonly string[], airport: SnapshotAirport): string[] {
  const missing = COMPONENTS.filter(
    (component) => airport.inputs[component].coverage === "missing",
  );
  if (missing.length === 0) return [...shared];
  const labels = missing.map((component) => COMPONENT_LABELS[component]);
  const verb = labels.length === 1 ? "is" : "are";
  return [
    ...shared,
    `${listPhrase(labels)} ${verb} missing for ${airport.iata}, so it has no composite because the input is absent, not because it scored low.`,
  ];
}

/**
 * One row's data gaps: the snapshot's own gap list, plus the ones that are true
 * of this airport alone.
 */
export function gapsFor(snapshot: AirportSnapshot, airport: SnapshotAirport): string[] {
  const gaps = [...snapshot.gaps];
  if (airport.region === null) {
    gaps.push(
      `${airport.iata} is in ${airport.state}, which the Census Bureau does not place in a division, so it never appears in a region ranking.`,
    );
  }
  if (airport.longHaulShare.coverage === "missing") {
    gaps.push(`Long-haul share is not available for ${airport.iata}.`);
  }
  return gaps;
}

// "Delay", then "Delay and Growth", then "Congestion, Delay and Growth": the
// component names read as a sentence, so a caveat naming two blanks is one line.
function listPhrase(labels: readonly string[]): string {
  const last = labels.at(-1) ?? "";
  if (labels.length <= 1) return last;
  return `${labels.slice(0, -1).join(", ")} and ${last}`;
}
