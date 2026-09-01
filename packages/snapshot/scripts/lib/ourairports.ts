export type Place = {
  /**
   * The code the snapshot keys on: the FAA locid where OurAirports agrees it is
   * also the IATA code, and the IATA code OurAirports publishes where it does
   * not. BTS files on-time performance under this one, never under the locid.
   */
  iata: string;
  ident: string;
  name: string;
  municipality: string;
  state: string;
} & Coordinates;

/**
 * OurAirports read two ways. The FAA workbook gives a *locid*, which for most
 * airports is also the IATA code and for a few dozen primaries is not: Mesa
 * Gateway is locid IWA and IATA AZA, Ceiba is RVR and NRR. So the code is tried
 * as an IATA code first — that is what BTS and the analyst say — and as an FAA
 * local code second.
 */
export type PlaceIndex = {
  byIata: ReadonlyMap<string, Place>;
  byLocalCode: ReadonlyMap<string, Place>;
};

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
 * The OurAirports place for an FAA locid, and with it the code the snapshot
 * keys on. OurAirports reassigns IATA codes between nightly builds, so the FAA
 * state has to agree either way: a silently wrong city would answer place
 * questions about the wrong airport. A locid whose IATA reading lands in
 * another state is not refused outright, because that is exactly what a locid
 * that is not an IATA code looks like — Boulder City is locid BVU, while BVU is
 * the IATA code of a village strip in Alaska — so the local-code reading is
 * tried before the join fails.
 */
export function placeFor(locid: string, state: string, places: PlaceIndex): Place {
  const alias = OURAIRPORTS_IATA_ALIASES[locid];
  const asIata = places.byIata.get(alias ?? locid);
  if (asIata && statesAgree(locid, state, asIata.state)) {
    // The FAA/BTS code stays the key even when OurAirports files the row under
    // a renamed one.
    return { ...asIata, iata: locid };
  }
  const asLocalCode = places.byLocalCode.get(locid);
  if (asLocalCode && statesAgree(locid, state, asLocalCode.state)) {
    if (!/^[A-Z]{3}$/.test(asLocalCode.iata)) {
      throw new Error(
        `${locid} joined OurAirports ${asLocalCode.ident} on its local code, which publishes no IATA code to key on`,
      );
    }
    return asLocalCode;
  }
  if (asIata) {
    throw new Error(
      `${locid} joined an OurAirports row in ${asIata.state}, but FAA files it in ${state}`,
    );
  }
  throw new Error(
    `${locid} has no OurAirports row to join on IATA or local code${alias ? ` (alias ${alias})` : ""}`,
  );
}

function statesAgree(locid: string, faaState: string, ourAirportsState: string): boolean {
  const disagreement = OURAIRPORTS_STATE_DISAGREEMENTS[locid];
  return disagreement === undefined
    ? ourAirportsState === faaState
    : disagreement.faa === faaState && disagreement.ourAirports === ourAirportsState;
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
