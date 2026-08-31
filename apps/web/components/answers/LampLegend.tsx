import { LAMP_LEGEND, LAMP_LEGEND_LABEL, LAMP_LEGEND_NOTE } from "@/app/lamp-hue";

/**
 * The key to the lamp hues (issue #25): the five lamp words next to the hue
 * their rows light, so the table can be read by someone who cannot see the
 * difference between the three.
 */
export function LampLegend() {
  return (
    <div className="flex flex-col gap-2 border-t border-grid px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[10px] font-medium tracking-[0.07em] text-muted-foreground uppercase">
          {LAMP_LEGEND_LABEL}
        </span>
        {LAMP_LEGEND.map((entry) => (
          <span
            key={entry.lamp}
            className={`rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${entry.pill}`}
          >
            {entry.lamp}
          </span>
        ))}
      </div>
      <p className="m-0 text-[11.5px] text-muted-foreground">{LAMP_LEGEND_NOTE}</p>
    </div>
  );
}
