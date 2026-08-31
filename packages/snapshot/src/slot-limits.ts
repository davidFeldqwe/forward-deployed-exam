// FAA schedule-facilitation and slot-controlled airports, hand-coded from
// https://www.faa.gov/about/office_org/headquarters_offices/ato/service_units/systemops/perf_analysis/slot_administration/slot_administration_schedule_facilitation
// The FAA publishes this as prose on two sub-pages, not as a dataset, so ingest
// re-verifies the codes resolve to snapshot airports and a human re-reads the
// page. Verified 2026-08-31.
export const SLOT_LIMIT_VERIFIED_ON = "2026-08-31";

export type SlotLimit = "Level 2" | "Level 3";

export const SLOT_LIMITS: Readonly<Record<string, SlotLimit>> = {
  ORD: "Level 2",
  LAX: "Level 2",
  EWR: "Level 2",
  SFO: "Level 2",
  JFK: "Level 3",
  LGA: "Level 3",
  DCA: "Level 3",
};

export function slotLimitOf(iata: string): SlotLimit | null {
  return SLOT_LIMITS[iata] ?? null;
}
