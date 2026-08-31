// The nine US Census divisions, keyed by the two-letter state code that the
// snapshot carries. Territories (PR, VI, GU, AS, MP) are outside the division
// map on purpose: the Census Bureau does not place them in a division, so their
// region stays null rather than being filed under a neighbouring division.
export const CENSUS_DIVISIONS = [
  "New England",
  "Middle Atlantic",
  "East North Central",
  "West North Central",
  "South Atlantic",
  "East South Central",
  "West South Central",
  "Mountain",
  "Pacific",
] as const;

export type CensusDivision = (typeof CENSUS_DIVISIONS)[number];

const STATES_BY_DIVISION: Record<CensusDivision, readonly string[]> = {
  "New England": ["CT", "ME", "MA", "NH", "RI", "VT"],
  "Middle Atlantic": ["NJ", "NY", "PA"],
  "East North Central": ["IL", "IN", "MI", "OH", "WI"],
  "West North Central": ["IA", "KS", "MN", "MO", "NE", "ND", "SD"],
  "South Atlantic": ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV"],
  "East South Central": ["AL", "KY", "MS", "TN"],
  "West South Central": ["AR", "LA", "OK", "TX"],
  Mountain: ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY"],
  Pacific: ["AK", "CA", "HI", "OR", "WA"],
};

const DIVISION_BY_STATE = new Map<string, CensusDivision>(
  CENSUS_DIVISIONS.flatMap((division) =>
    STATES_BY_DIVISION[division].map(
      (state) => [state, division] as [string, CensusDivision],
    ),
  ),
);

export function censusDivisionOf(state: string): CensusDivision | null {
  return DIVISION_BY_STATE.get(state.toUpperCase()) ?? null;
}
