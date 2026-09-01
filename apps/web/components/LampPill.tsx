import type { CandidateLamp } from "@repo/scoring";

import { lampPill } from "@/app/lamp-hue";

/**
 * One lamp word as a key draws it: the words, in the hue `lampPill` gives them.
 * Both keys come through here — the one under a ranking table and the one under
 * the `/map` skyline — so the two cannot name the same lamp at two sizes.
 *
 * A ranked row keeps its own pill: it is sized for the table cell it sits in,
 * not for a key, and it is the rows the keys explain.
 */
export function LampPill({ lamp }: { lamp: CandidateLamp }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${lampPill(lamp)}`}
    >
      {lamp}
    </span>
  );
}
