import { CANDIDATE_LAMPS } from "@repo/scoring";

import { LAMP_LEGEND_NOTE } from "@/app/lamp-hue";
import { LampPill } from "@/components/LampPill";

/**
 * The key to the lamp hues (issue #25): the five lamp words next to the hue
 * their rows light, so the table can be read by someone who cannot see the
 * difference between the three. The pills are `LampPill`, the same chip the
 * `/map` key draws, so neither key can drift from the table above it.
 */
export function LampLegend() {
  return (
    <div className="flex flex-col gap-2 border-t border-grid px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[10px] font-medium tracking-[0.07em] text-muted-foreground uppercase">
          Candidate lamp
        </span>
        {CANDIDATE_LAMPS.map((lamp) => (
          <LampPill key={lamp} lamp={lamp} />
        ))}
      </div>
      <p className="m-0 text-[11.5px] text-muted-foreground">{LAMP_LEGEND_NOTE}</p>
    </div>
  );
}
