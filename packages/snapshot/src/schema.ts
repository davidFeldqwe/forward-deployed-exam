import { z } from "zod";

import { CENSUS_DIVISIONS } from "./census-divisions.ts";
import { SLOT_LIMIT_LEVELS } from "./slot-limits.ts";

export const coverageSchema = z.enum(["present", "missing"]);
export const peerGroupSchema = z.enum(["large", "medium", "small"]);
export const slotLimitSchema = z.enum(SLOT_LIMIT_LEVELS);

// Missing is not a low score: an absent input keeps `raw` null and flags
// coverage, so scoring can withhold the composite instead of zero-filling.
const scoreInputSchema = z
  .strictObject({
    raw: z.number().nullable(),
    coverage: coverageSchema,
  })
  .refine((input) => (input.raw === null) === (input.coverage === "missing"), {
    message: "coverage must be missing exactly when raw is null",
  });

const scoreInputsSchema = z.strictObject({
  congestion: scoreInputSchema,
  unmetFlightDemand: scoreInputSchema,
  delay: scoreInputSchema,
  growth: scoreInputSchema,
});

const windowedCountSchema = z.strictObject({
  firstYear: z.number().nonnegative().nullable(),
  secondYear: z.number().nonnegative().nullable(),
});

export const airportSchema = z
  .strictObject({
    iata: z.string().regex(/^[A-Z]{3}$/),
    name: z.string().min(1),
    municipality: z.string().min(1),
    state: z.string().regex(/^[A-Z]{2}$/),
    region: z.enum(CENSUS_DIVISIONS).nullable(),
    // OurAirports degrees, carried so the thread can place a resolved airport set
    // without a second lookup at query time. Nullable as a pair, checked below: a
    // source that does not locate an airport is not an airport at 0, 0.
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    peerGroup: peerGroupSchema,
    runwayCount: z.number().int().positive().nullable(),
    slotLimit: slotLimitSchema.nullable(),
    enplanements: windowedCountSchema,
    flights: windowedCountSchema,
    inputs: scoreInputsSchema,
    longHaulShare: z.strictObject({
      share: z.number().min(0).max(1).nullable(),
      longHaulFlights: z.number().int().nonnegative().nullable(),
      coverage: coverageSchema,
    }),
  })
  .refine((airport) => (airport.latitude === null) === (airport.longitude === null), {
    message: "a coordinate is a pair: half of one is not a point on a map",
  });

const yearSchema = z.number().int().min(2000).max(2100);

const sourceSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.url(),
  vintage: z.string().min(1),
});

export const airportSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    // Ingest timestamp; the comparison-window years below complete the as-of date.
    asOf: z.iso.datetime(),
    joinKey: z.literal("iata"),
    comparisonWindow: z.strictObject({
      firstYear: yearSchema,
      secondYear: yearSchema,
    }),
    methodology: z.strictObject({
      units: z.strictObject({
        congestion: z.string().min(1),
        unmetFlightDemand: z.string().min(1),
        delay: z.string().min(1),
        growth: z.string().min(1),
      }),
      longHaulShare: z.strictObject({
        basis: z.literal("domestic-departures"),
        thresholdMiles: z.literal(2000),
      }),
    }),
    sources: z.array(sourceSchema).min(1),
    gaps: z.array(z.string().min(1)).min(1),
    airports: z.array(airportSchema).min(1),
  })
  .refine(
    (snapshot) =>
      snapshot.comparisonWindow.secondYear ===
      snapshot.comparisonWindow.firstYear + 1,
    { message: "comparison window must be two consecutive calendar years" },
  )
  .refine(
    (snapshot) =>
      new Set(snapshot.airports.map((airport) => airport.iata)).size ===
      snapshot.airports.length,
    { message: "IATA is the join key, so it must be unique" },
  );

export type Coverage = z.infer<typeof coverageSchema>;
export type PeerGroup = z.infer<typeof peerGroupSchema>;
export type SnapshotAirport = z.infer<typeof airportSchema>;
export type AirportSnapshot = z.infer<typeof airportSnapshotSchema>;
