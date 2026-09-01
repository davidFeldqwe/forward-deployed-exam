import type { PendingRowPart } from "@/app/thread-answer";
import { HeadCell } from "@/components/answers/HeadCell";

/**
 * The row a question in flight draws (PRD story 35). It draws no number: the
 * composite and the candidate lamp cells stay empty until the tool payload
 * lands, so a reader never sees half a composite. Every word on it comes from
 * the part, which carries no score-shaped field for one to arrive in.
 */
export function PendingRow({ row }: { row: PendingRowPart }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border bg-card">
      <div className={`${STRIP} border-b bg-row-head py-2.5`}>
        <HeadCell className={RANK}>#</HeadCell>
        <HeadCell className={AIRPORT}>Airport</HeadCell>
        <HeadCell className="shrink-0 text-right">Composite</HeadCell>
        <HeadCell className="shrink-0">Candidate lamp</HeadCell>
      </div>
      {/* The row exists; its scores do not. Both number cells are left empty
          rather than filled with a placeholder that reads as one. */}
      <div className={`${STRIP} border-b border-grid py-3`}>
        <span className={`${RANK} font-mono text-xs text-muted-foreground/70`} aria-hidden>
          ·
        </span>
        <span className={`${AIRPORT} text-[13.5px] text-muted-foreground`}>{row.airportLabel}</span>
        <span className="shrink-0" />
        <span className="shrink-0 justify-self-start rounded border border-border px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap text-muted-foreground">
          {row.rowLabel}
        </span>
      </div>
      <p className="m-0 px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
        {row.label} {row.note}
      </p>
    </section>
  );
}

const STRIP = "flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5";

const RANK = "w-[26px] shrink-0";

const AIRPORT = "min-w-0 flex-1 basis-40";
