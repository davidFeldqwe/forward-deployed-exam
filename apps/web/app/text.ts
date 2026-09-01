/**
 * Text bounds counted in characters rather than UTF-16 units. A `slice` cuts
 * between units, so a bound that falls inside an astral character — an emoji in
 * a question — keeps half of it: a lone surrogate, which is not valid UTF-8 and
 * comes back out of any store that re-encodes it as “�”.
 *
 * Characters, not grapheme clusters: a cut inside a ZWJ sequence still stores
 * text every store can hold, and segmenting graphemes would ship `Intl.Segmenter`
 * into the client bundle for a bound only the server applies.
 */
export function clip(text: string, maxLength: number): string {
  const characters = Array.from(text);
  if (characters.length <= maxLength) {
    return text;
  }
  return characters.slice(0, maxLength).join("");
}

/**
 * Where a phrase begins in a text, as words rather than as letters inside a
 * longer one, or -1. Letters bound it on both sides — `\p{L}`, so an accented
 * name is one word — which keeps "ME" out of "come" and "Ohio" out of "Ohioan".
 * A phrase that is a whole word inside a longer name still matches, "Virginia"
 * in "West Virginia" among them: which of two overlapping names a caller wants
 * is the caller's to decide, from the indices this returns. The bounds are
 * lookarounds and match no character of their own, so the index returned is the
 * phrase's own: callers that compare two of them are comparing where the two
 * phrases start. A blank phrase is nowhere: it would otherwise match the gap
 * between any two characters.
 */
export function indexOfPhrase(text: string, phrase: string): number {
  if (phrase.trim().length === 0) {
    return -1;
  }
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.search(new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "iu"));
}
