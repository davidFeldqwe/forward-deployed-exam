import { CANDIDATE_LAMPS } from "@repo/scoring";

import { LAMP_LEGEND_NOTE, lampPill } from "@/app/lamp-hue";

/**
 * The key to the lamp hues (issue #25): the five lamp words next to the hue
 * their rows light, so the table can be read by someone who cannot see the
 * difference between the three. The pills come from the same `lampPill` the
 * rows draw with, so the key cannot drift from the table above it.
 */
export function LampLegend() {
  return (
    <div className="flex flex-col gap-2 border-t border-grid px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[10px] font-medium tracking-[0.07em] text-muted-foreground uppercase">
          Candidate lamp
        </span>
        {CANDIDATE_LAMPS.map((lamp) => (
          <span
            key={lamp}
            className={`rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${lampPill(lamp)}`}
          >
            {lamp}
          </span>
        ))}
      </div>
      <p className="m-0 text-[11.5px] text-muted-foreground">{LAMP_LEGEND_NOTE}</p>
    </div>
  );
}
