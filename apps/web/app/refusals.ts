/**
 * The two refusals this screen owes an analyst (PRD stories 31-32), as copy this
 * repo owns rather than a sentence the model composes each time: an off-thesis
 * question, and a place phrase the screen cannot resolve.
 *
 * Both are locked here because both are claims about scope. A model that
 * paraphrases "what this screen answers" is one paraphrase away from implying it
 * ran a deal screen, and a model that improvises the accepted place phrases will
 * eventually offer one that resolves to nothing. The system prompt hands the
 * model these strings, and the answer objects draw them from the same module, so
 * the prose and the block under it cannot disagree.
 *
 * The glossary's _Avoid_ list for the capacity-pressure screen — cost, ROI, land,
 * politics, leases — is a list of things the screen must not be described as
 * measuring. Naming them here is the opposite: it is how the screen says it does
 * not measure them.
 */

/** What the capacity-pressure screen answers, in the glossary's own words. */
export const SCREEN_ANSWERS = [
  "which airports are renovation-investment candidates, ranked by capacity pressure",
  "the score vector behind a composite: congestion, unmet flight demand, delay and growth",
  "a single-metric lookup, such as delay minutes or long-haul share",
  "how the screen works: the comparison window, the weights, the peer groups and the known gaps",
] as const;

/** What it does not, and will not estimate: this is a screen, not deal economics. */
export const SCREEN_REFUSES = [
  "construction cost",
  "ROI or payback",
  "land availability",
  "politics and approvals",
  "airline leases and gate agreements",
] as const;

export const OFF_THESIS_REFUSAL = [
  "That sits outside the capacity-pressure screen, so there is no number in this snapshot to",
  `answer it with. The screen answers: ${SCREEN_ANSWERS.join("; ")}.`,
  `It does not answer, and will not estimate: ${SCREEN_REFUSES.join(", ")}.`,
  "Those are deal economics; nothing this screen ingests measures them.",
].join(" ");

/**
 * The place phrases the screen accepts (story 32). The values behind each one
 * are the universe's own — `describeMethodology` hands the model
 * `acceptedPlacePhrases` — so this list names the *kinds* and leaves the values
 * to the module that filters on them.
 */
export const ACCEPTED_PLACE_PHRASES = [
  "an IATA code (BOS)",
  "a municipality (Boston)",
  "a two-letter state code (MA)",
  "one of the nine US Census divisions (New England)",
] as const;

/**
 * The refusal for a place phrase no airport in the screen carries, or null when
 * every filter resolved. It names the phrase back, says nothing was guessed, and
 * lists what would have worked: a refusal that does not say what to ask instead
 * reads as "no airports there", which is a different and wrong answer.
 */
export function unknownPlaceRefusal(
  // The field is a plain string, not a `PlaceField`: these come back off a
  // stored payload, and a refusal quotes what was asked rather than re-checking
  // that the screen spelled its own filter name correctly.
  unknown: readonly { field: string; value: string }[],
): string | null {
  if (unknown.length === 0) {
    return null;
  }
  const phrases = unknown.map(({ field, value }) => `${field} “${value}”`).join(" or ");
  return (
    `No airport in this screen carries ${phrases}, so nothing was ranked for it. ` +
    "The phrase was not geocoded and no nearby airport was guessed. " +
    `Ask again with ${ACCEPTED_PLACE_PHRASES.join(", ")}.`
  );
}

/**
 * The refusal for a requested code the screen does not cover, or null when every
 * code resolved. Outside the universe is not "no such airport": IAN is a real
 * airport, it is simply not a primary this snapshot screens.
 */
export function unknownIataRefusal(codes: readonly string[]): string | null {
  if (codes.length === 0) {
    return null;
  }
  return (
    `${codes.join(", ")} ${codes.length === 1 ? "is" : "are"} outside the screened universe: ` +
    "this snapshot covers every US primary commercial airport by ACAIS enplanements, so there is no row to " +
    "rank and no number to quote."
  );
}
