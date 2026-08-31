export type Place = {
  ident: string;
  name: string;
  municipality: string;
  state: string;
} & Coordinates;

/**
 * Where the airport is, in degrees, or nowhere. Both or neither: half a pair is
 * not a point, and 0 is a real coordinate off the Gulf of Guinea, so a blank
 * never becomes one.
 */
export type Coordinates = {
  latitude: number | null;
  longitude: number | null;
};

// OurAirports files Palm Beach International under the post-rename code DJT
// while FAA ACAIS and BTS both still publish PBI. The snapshot keys on the
// FAA/BTS code and looks the place up under the OurAirports one.
export const OURAIRPORTS_IATA_ALIASES: Readonly<Record<string, string>> = { PBI: "DJT" };

// Reagan National sits on the Virginia bank of the Potomac: FAA ACAIS files it
// in VA, OurAirports under the District. A standing disagreement, not a bad
// join, so it is named here rather than loosening the check for everyone.
const OURAIRPORTS_STATE_DISAGREEMENTS: Readonly<
  Record<string, { faa: string; ourAirports: string }>
> = { DCA: { faa: "VA", ourAirports: "DC" } };

/**
 * The two-letter code the snapshot calls `state`. OurAirports gives states as
 * `US-CA`, but a territory as its own country plus a subdivision (`PR`,
 * `PR-U-A`), and FAA ACAIS writes the territory itself.
 */
export function stateOf(isoCountry: string, isoRegion: string): string {
  return isoCountry === "US" ? isoRegion.replace(/^US-/, "") : isoCountry;
}

/**
 * The OurAirports place for an FAA/BTS code. OurAirports reassigns IATA codes
 * between nightly builds, so the FAA state has to agree: a silently wrong city
 * would answer place questions about the wrong airport.
 */
export function placeFor(
  iata: string,
  state: string,
  places: ReadonlyMap<string, Place>,
): Place {
  const alias = OURAIRPORTS_IATA_ALIASES[iata];
  const place = places.get(alias ?? iata);
  if (!place) {
    throw new Error(
      `${iata} has no OurAirports row to join on IATA${alias ? ` (alias ${alias})` : ""}`,
    );
  }
  const disagreement = OURAIRPORTS_STATE_DISAGREEMENTS[iata];
  const agrees =
    disagreement === undefined
      ? place.state === state
      : disagreement.faa === state && disagreement.ourAirports === place.state;
  if (!agrees) {
    throw new Error(
      `${iata} joined an OurAirports row in ${place.state}, but FAA files it in ${state}`,
    );
  }
  return place;
}

/**
 * The OurAirports coordinate pair for one airport, as degrees. The snapshot
 * carries these so the thread can place a resolved airport set without a second
 * source; scoring passes them through and never computes on them.
 *
 * A blank half means the source does not locate this airport, which is reported
 * as no point at all. A value that is present but not a coordinate is a changed
 * file rather than a missing airport, so it fails the ingest instead of shipping
 * a marker in the wrong hemisphere.
 */
export function coordinatesOf(ident: string, latitude: string, longitude: string): Coordinates {
  const latitudeText = latitude.trim();
  const longitudeText = longitude.trim();
  if (latitudeText === "" || longitudeText === "") {
    return { latitude: null, longitude: null };
  }
  return {
    latitude: degrees(ident, "latitude", latitudeText, 90),
    longitude: degrees(ident, "longitude", longitudeText, 180),
  };
}

function degrees(ident: string, axis: string, value: string, bound: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > bound) {
    throw new Error(`${ident} has an OurAirports ${axis} outside degrees: ${value}`);
  }
  return parsed;
}
