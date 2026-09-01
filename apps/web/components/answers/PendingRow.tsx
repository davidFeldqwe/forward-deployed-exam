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
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className={`${GRID} border-b bg-row-head px-3.5 py-2.5`}>
        <HeadCell>#</HeadCell>
        <HeadCell>Airport</HeadCell>
        <HeadCell className="text-right">Composite</HeadCell>
        <HeadCell>Candidate lamp</HeadCell>
      </div>
      {/* The row exists; its scores do not. Both number cells are left empty
          rather than filled with a placeholder that reads as one. */}
      <div className={`${GRID} border-b border-grid px-3.5 py-3`}>
        <span className="font-mono text-xs text-muted-foreground/70" aria-hidden>
          ·
        </span>
        <span className="text-[13.5px] text-muted-foreground">{row.airportLabel}</span>
        <span />
        <span className="justify-self-start rounded border border-border px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap text-muted-foreground">
          {row.rowLabel}
        </span>
      </div>
      <p className="m-0 px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
        {row.label} {row.note}
      </p>
    </section>
  );
}

const GRID = "grid grid-cols-[26px_1fr_74px_150px] items-center gap-3";
