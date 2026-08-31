import type { CarriedContext as CarriedContextView } from "@/app/carried-context";

/**
 * **Carried context** (PRD story 29): how this thread resolved "the second one",
 * shown before the resolved airport set and the score vector under it. The
 * analyst reads which row the phrase became before they read a number for it,
 * and the block only appears when the thread really did resolve a reference.
 */
export function CarriedContext({ carried }: { carried: CarriedContextView }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3.5">
      <span className="text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Carried context
      </span>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-sm font-medium text-foreground">&ldquo;{carried.phrase}&rdquo;</span>
        <span className="text-[13px] text-muted-foreground/70">→</span>
        <ul className="flex list-none flex-wrap gap-1.5 p-0">
          {carried.airports.map((airport) => (
            <li
              key={airport.iata}
              className="rounded border bg-raised px-1.5 py-0.5 font-mono text-xs text-body"
            >
              {airport.iata}
            </li>
          ))}
        </ul>
      </div>
      <span className="text-[12.5px] text-muted-foreground">{carried.summary}</span>
      <span className="text-[12.5px] text-body">{carried.note}</span>
    </section>
  );
}
