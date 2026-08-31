import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { censusDivisionOf } from "../src/census-divisions.ts";
import {
  airportSnapshotSchema,
  type AirportSnapshot,
  type SnapshotAirport,
} from "../src/schema.ts";
import { SLOT_LIMITS, SLOT_LIMIT_VERIFIED_ON, slotLimitOf } from "../src/slot-limits.ts";
import { download } from "./lib/cache.ts";
import { forEachCsvRow } from "./lib/csv.ts";
import { readFaaUniverse, type FaaUniverseRow } from "./lib/faa-workbook.ts";
import { coordinatesOf, placeFor, stateOf, type Place } from "./lib/ourairports.ts";
import { readWorksheetRows } from "./lib/xlsx.ts";
import { readZipEntry } from "./lib/zip.ts";

// The latest two calendar years with *final* FAA enplanements at ingest. The
// CY2025 release was still preliminary on 2026-08-31, so the window stops at
// 2024 and every airport is measured on the same pair.
const COMPARISON_WINDOW = { firstYear: 2023, secondYear: 2024 } as const;
const UNIVERSE_SIZE = 100;
const LONG_HAUL_MILES = 2000;

const FAA_ENPLANEMENTS_PAGE =
  "https://www.faa.gov/airports/planning_capacity/passenger_allcargo_stats/passenger";
const FAA_SLOT_PAGE =
  "https://www.faa.gov/about/office_org/headquarters_offices/ato/service_units/systemops/perf_analysis/slot_administration/slot_administration_schedule_facilitation";
const OURAIRPORTS_PAGE = "https://davidmegginson.github.io/ourairports-data/";
const BTS_ON_TIME_PAGE = "https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FGJ";

type FlightTotals = {
  departures: number;
  longHaulDepartures: number;
  arrivals: number;
  arrivalDelayMinutes: number;
  weatherDelayMinutes: number;
};

function emptyTotals(): FlightTotals {
  return {
    departures: 0,
    longHaulDepartures: 0,
    arrivals: 0,
    arrivalDelayMinutes: 0,
    weatherDelayMinutes: 0,
  };
}

async function readUniverse(): Promise<FaaUniverseRow[]> {
  const year = COMPARISON_WINDOW.secondYear;
  const workbook = await download(
    `${FAA_ENPLANEMENTS_PAGE}/arp-cy${year}-commercial-service-enplanements.xlsx`,
    `faa-acais-cy${year}.xlsx`,
  );
  return readFaaUniverse(readWorksheetRows(workbook), COMPARISON_WINDOW, UNIVERSE_SIZE);
}

// OurAirports files territories under their own ISO country code, so a US
// snapshot has to accept them alongside "US" or it loses San Juan and Guam.
const US_COUNTRY_CODES = new Set(["US", "PR", "VI", "GU", "AS", "MP"]);

async function readPlaces(): Promise<Map<string, Place>> {
  const csv = await download(`${OURAIRPORTS_PAGE}airports.csv`, "ourairports-airports.csv");
  const places = new Map<string, Place>();
  forEachCsvRow(
    csv,
    [
      "ident",
      "name",
      "municipality",
      "iso_country",
      "iso_region",
      "iata_code",
      "latitude_deg",
      "longitude_deg",
    ],
    ([ident, name, municipality, country, region, iata, latitude, longitude]) => {
      if (!US_COUNTRY_CODES.has(country) || iata.length !== 3) {
        return;
      }
      places.set(iata, {
        ident,
        name,
        municipality,
        state: stateOf(country, region),
        ...coordinatesOf(ident, latitude, longitude),
      });
    },
  );
  return places;
}

async function readRunwayCounts(): Promise<Map<string, number>> {
  const csv = await download(`${OURAIRPORTS_PAGE}runways.csv`, "ourairports-runways.csv");
  const counts = new Map<string, number>();
  forEachCsvRow(csv, ["airport_ident", "closed"], ([ident, closed]) => {
    if (closed === "1") {
      return;
    }
    counts.set(ident, (counts.get(ident) ?? 0) + 1);
  });
  return counts;
}

async function readFlightTotals(
  year: number,
  universe: ReadonlySet<string>,
): Promise<Map<string, FlightTotals>> {
  const totals = new Map<string, FlightTotals>();
  const totalsFor = (iata: string): FlightTotals | null => {
    if (!universe.has(iata)) {
      return null;
    }
    const existing = totals.get(iata);
    if (existing) {
      return existing;
    }
    const created = emptyTotals();
    totals.set(iata, created);
    return created;
  };

  for (let month = 1; month <= 12; month += 1) {
    const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
    const archive = await download(
      `https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_${year}_${month}.zip`,
      `bts-on-time-${yearMonth}.zip`,
    );
    const csv = readZipEntry(archive, (name) => name.endsWith(".csv"));
    forEachCsvRow(
      csv,
      ["Origin", "Dest", "Cancelled", "Flights", "Distance", "ArrDelayMinutes", "WeatherDelay"],
      ([origin, dest, cancelled, flights, distance, arrivalDelay, weatherDelay]) => {
        if (Number(cancelled) > 0) {
          return;
        }
        const departure = totalsFor(origin);
        if (departure) {
          const performed = Number(flights);
          departure.departures += performed;
          if (Number(distance) > LONG_HAUL_MILES) {
            departure.longHaulDepartures += performed;
          }
        }
        const arrival = arrivalDelay === "" ? null : totalsFor(dest);
        if (arrival) {
          arrival.arrivals += 1;
          arrival.arrivalDelayMinutes += Number(arrivalDelay);
          arrival.weatherDelayMinutes += Number(weatherDelay === "" ? 0 : weatherDelay);
        }
      },
    );
    process.stdout.write(`aggregated ${yearMonth}\n`);
  }
  return totals;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function scoreInput(raw: number | null): SnapshotAirport["inputs"]["congestion"] {
  return raw === null ? { raw: null, coverage: "missing" } : { raw, coverage: "present" };
}

function percentChange(first: number | null, second: number | null): number | null {
  if (first === null || second === null || first <= 0) {
    return null;
  }
  return ((second - first) / first) * 100;
}

// Stand-in for the gate and terminal capacity no free source publishes.
function congestionPerRunway(enplanements: number, runwayCount: number | null): number | null {
  return runwayCount === null ? null : Math.round(enplanements / runwayCount);
}

// Percentage points of enplanement growth that added departures do not explain.
function unmetFlightDemandPoints(
  enplanementGrowth: number | null,
  flightGrowth: number | null,
): number | null {
  if (enplanementGrowth === null || flightGrowth === null) {
    return null;
  }
  return round(enplanementGrowth - flightGrowth, 2);
}

// Weather delay comes out: it is a season, not a capacity signal.
function delayPerArrival(totals: FlightTotals | undefined): number | null {
  if (!totals || totals.arrivals <= 0) {
    return null;
  }
  return round((totals.arrivalDelayMinutes - totals.weatherDelayMinutes) / totals.arrivals, 2);
}

function longHaulShareOf(
  departures: number,
  longHaulDepartures: number,
): SnapshotAirport["longHaulShare"] {
  if (departures <= 0) {
    return { share: null, longHaulFlights: null, coverage: "missing" };
  }
  return {
    share: round(longHaulDepartures / departures, 4),
    longHaulFlights: longHaulDepartures,
    coverage: "present",
  };
}

function buildAirport(
  row: FaaUniverseRow,
  place: Place,
  runwayCount: number | null,
  firstYearTotals: FlightTotals | undefined,
  secondYearTotals: FlightTotals | undefined,
): SnapshotAirport {
  const enplanementGrowth = percentChange(
    row.enplanements.firstYear,
    row.enplanements.secondYear,
  );
  const departures = {
    firstYear: firstYearTotals?.departures ?? null,
    secondYear: secondYearTotals?.departures ?? null,
  };
  const flightGrowth = percentChange(departures.firstYear, departures.secondYear);
  const windowDepartures =
    (firstYearTotals?.departures ?? 0) + (secondYearTotals?.departures ?? 0);
  const windowLongHaul =
    (firstYearTotals?.longHaulDepartures ?? 0) + (secondYearTotals?.longHaulDepartures ?? 0);

  return {
    iata: row.iata,
    name: place.name,
    municipality: place.municipality,
    state: row.state,
    region: censusDivisionOf(row.state),
    latitude: place.latitude,
    longitude: place.longitude,
    peerGroup: row.peerGroup,
    runwayCount,
    slotLimit: slotLimitOf(row.iata),
    enplanements: row.enplanements,
    flights: departures,
    inputs: {
      congestion: scoreInput(congestionPerRunway(row.enplanements.secondYear, runwayCount)),
      unmetFlightDemand: scoreInput(unmetFlightDemandPoints(enplanementGrowth, flightGrowth)),
      delay: scoreInput(delayPerArrival(secondYearTotals)),
      growth: scoreInput(enplanementGrowth === null ? null : round(enplanementGrowth, 2)),
    },
    longHaulShare: longHaulShareOf(windowDepartures, windowLongHaul),
  };
}

async function ingest(): Promise<AirportSnapshot> {
  const universe = await readUniverse();
  const iataCodes = new Set(universe.map((row) => row.iata));
  for (const iata of Object.keys(SLOT_LIMITS)) {
    if (!iataCodes.has(iata)) {
      throw new Error(`slot-limited ${iata} is missing from the enplanement universe`);
    }
  }

  const places = await readPlaces();
  const runwayCounts = await readRunwayCounts();
  const firstYearFlights = await readFlightTotals(COMPARISON_WINDOW.firstYear, iataCodes);
  const secondYearFlights = await readFlightTotals(COMPARISON_WINDOW.secondYear, iataCodes);

  const airports = [...universe]
    .sort((left, right) => right.enplanements.secondYear - left.enplanements.secondYear)
    .map((row) => {
      const place = placeFor(row.iata, row.state, places);
      return buildAirport(
        row,
        place,
        runwayCounts.get(place.ident) ?? null,
        firstYearFlights.get(row.iata),
        secondYearFlights.get(row.iata),
      );
    });

  return airportSnapshotSchema.parse({
    schemaVersion: 1,
    asOf: new Date().toISOString(),
    joinKey: "iata",
    comparisonWindow: COMPARISON_WINDOW,
    methodology: {
      units: {
        congestion: `enplanements per open runway in ${COMPARISON_WINDOW.secondYear}`,
        unmetFlightDemand:
          "percentage points by which enplanement growth exceeds departure growth across the window",
        delay: `arrival delay minutes per arrival with weather delay removed, ${COMPARISON_WINDOW.secondYear}`,
        growth: "percent change in enplanements across the window",
      },
      longHaulShare: { basis: "domestic-departures", thresholdMiles: LONG_HAUL_MILES },
    },
    sources: [
      {
        id: "faa-acais",
        name: "FAA ACAIS calendar-year enplanements at commercial service airports",
        url: FAA_ENPLANEMENTS_PAGE,
        vintage: `CY${COMPARISON_WINDOW.secondYear} final, with the CY${COMPARISON_WINDOW.firstYear} comparative column`,
      },
      {
        id: "bts-on-time-performance",
        name: "BTS Reporting Carrier On-Time Performance",
        url: BTS_ON_TIME_PAGE,
        vintage: `monthly files for ${COMPARISON_WINDOW.firstYear}-01 through ${COMPARISON_WINDOW.secondYear}-12`,
      },
      {
        id: "ourairports",
        name: "OurAirports airports and runways",
        url: OURAIRPORTS_PAGE,
        vintage: "nightly build retrieved at ingest",
      },
      {
        id: "faa-slot-administration",
        name: "FAA slot administration Level 2 and Level 3 airports",
        url: FAA_SLOT_PAGE,
        vintage: `hand-coded list, verified ${SLOT_LIMIT_VERIFIED_ON}`,
      },
    ],
    gaps: [
      "No free source publishes gate or terminal capacity, so congestion uses enplanements per open runway; FAA ASPM declared rates are login-gated.",
      "Long-haul share counts BTS domestic reporting-carrier departures over 2,000 miles. International long-haul is out of scope because T-100 Segment has no stable bulk download.",
      "Departure counts and delay minutes cover BTS reporting carriers only, so unmet flight demand omits carriers under the 1% revenue reporting threshold.",
      "Territories have no US Census division, so their region is null and they never appear in a division ranking.",
      `FAA CY${COMPARISON_WINDOW.secondYear + 1} enplanements were still preliminary at ingest, so the comparison window is the latest two final calendar years.`,
    ],
    airports,
  });
}

const snapshot = await ingest();
const path = join(import.meta.dirname, "..", "data", "us-airports-snapshot.json");
writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
process.stdout.write(`wrote ${snapshot.airports.length} airports to ${path}\n`);
