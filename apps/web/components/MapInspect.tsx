import { COMPONENTS, COMPONENT_LABELS } from "@repo/scoring";

import type { InspectTooltip } from "@/app/map-inspect";
import { LampPill } from "@/components/LampPill";

/**
 * The one inspect card on `/map` (issue #71): IATA, the lamp pill, composite,
 * and the four-number score vector. Hover, keyboard focus, and a tap-pin all
 * render this — never a native `title`, never a dossier.
 */
export function MapInspect({ tooltip }: { tooltip: InspectTooltip }) {
  const composite = tooltip.composite === null ? "—" : String(tooltip.composite);

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute top-3 left-3 z-10 max-w-[min(100%-1.5rem,20rem)] rounded-md border bg-card/95 px-3 py-2.5 shadow-lg backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium tracking-wide text-foreground">
          {tooltip.iata}
        </span>
        <LampPill lamp={tooltip.lamp} />
        <span className="font-mono text-[13px] text-muted-foreground">
          {composite}
          {tooltip.composite !== null ? "/100" : null}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {COMPONENTS.map((key) => {
          const { percentile } = tooltip.scoreVector[key];
          return (
            <div key={key} className="contents">
              <dt className="text-[11.5px] text-muted-foreground">{COMPONENT_LABELS[key]}</dt>
              <dd className="text-right font-mono text-[11.5px] text-body">
                {percentile === null ? "—" : percentile}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
