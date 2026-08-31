/**
 * The streaming state (PRD story 35): what the thread shows between Send and the
 * answer landing. A pending row is a row with no scores in it — no composite,
 * no half-composite, no candidate lamp — because the screen has not returned a
 * row yet, and a number drawn early is a number that changes under the reader.
 *
 * The copy carries no digits at all, which `pending-answer.test.ts` pins: there
 * is no number here to mistake for a score. The withheld-composite mark is not
 * used either — "—" says the screen ran and withheld a number, and nothing has
 * run yet.
 */
export const pendingAnswer = {
  label: "Running the capacity-pressure screen…",
  rowLabel: "Pending",
  airportLabel: "Resolving the airport set",
  note:
    "No composite and no candidate lamp until queryAirports returns the row: a part-scored row " +
    "is never drawn.",
} as const;
