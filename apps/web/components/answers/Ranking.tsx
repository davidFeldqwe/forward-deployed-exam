import type { LampTone, RankingRowView, VectorCell } from "@/app/ranking-view";

/**
 * The ranking table (PRD stories 23-24), rendered from the `queryAirports`
 * payload. Each row's score vector is collapsed on the row and expands in
 * place: the numbers open under the airport they belong to, not on another
 * screen.
 */
export function Ranking({ rows, sortLabel }: { rows: RankingRowView[]; sortLabel: string }) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className={`${GRID} border-b bg-row-head px-3.5 py-2.5`}>
        <HeadCell>#</HeadCell>
        <HeadCell>Airport</HeadCell>
        <HeadCell className="text-right">Composite</HeadCell>
        <HeadCell>Candidate lamp</HeadCell>
        <span />
      </div>
      {rows.map((row) => (
        <Row key={row.iata} row={row} />
      ))}
      <p className="m-0 px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
        Composite 0–100, sorted by {sortLabel} · percentile within the airport&apos;s FAA hub-size
        peer group, computed nationally. Open a row for its score vector.
      </p>
    </section>
  );
}

const GRID = "grid grid-cols-[26px_1fr_74px_150px_14px] items-center gap-3";

/** Hue on the lamp, never instead of it: the words are always in the pill. */
const LAMP_HUE: Readonly<Record<LampTone, string>> = {
  strong: "text-lamp-strong",
  mixed: "text-lamp-mixed",
  weak: "text-lamp-weak",
  // Partial inputs and No data are coverage states, so they take no hue at all.
  none: "text-muted-foreground",
};

function Row({ row }: { row: RankingRowView }) {
  return (
    <details className="group border-b border-grid last:border-b-0">
      <summary
        className={`${GRID} cursor-pointer list-none px-3.5 py-3 hover:bg-raised/40 [&::-webkit-details-marker]:hidden`}
      >
        <span className="font-mono text-xs text-muted-foreground/70">{row.rank}</span>
        <span className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className="font-mono text-sm font-medium text-foreground">{row.iata}</span>
          <span className="text-[13.5px] text-body">{row.name}</span>
          {row.whyLabels.map((label) => (
            <span
              key={label}
              className="rounded-sm border bg-raised px-1.5 py-0.5 font-mono text-[10.5px] whitespace-nowrap text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </span>
        <span className="flex items-baseline justify-end gap-1">
          <span className="font-mono text-[15px] font-medium text-foreground">{row.composite}</span>
          {row.composite === "—" ? null : (
            <span className="text-[10px] text-muted-foreground/70">/100</span>
          )}
        </span>
        <span
          className={`justify-self-start rounded border bg-raised px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${LAMP_HUE[row.tone]}`}
        >
          {row.lamp}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          <span className="group-open:hidden">▸</span>
          <span className="hidden group-open:inline">▾</span>
        </span>
      </summary>
      <ScoreVector row={row} />
    </details>
  );
}

/** The four percentiles the composite is built from, with their raw values. */
function ScoreVector({ row }: { row: RankingRowView }) {
  return (
    <div className="bg-background px-3.5 pb-3.5 pl-10">
      <div className="overflow-hidden rounded-md border">
        <div className={`${VECTOR_GRID} border-b bg-row-head px-3 py-2`}>
          <HeadCell>Component</HeadCell>
          <HeadCell>Percentile</HeadCell>
          <HeadCell className="text-right">Raw value</HeadCell>
          <HeadCell className="text-right">Weight</HeadCell>
        </div>
        {row.vector.map((cell) => (
          <VectorRow key={cell.key} cell={cell} />
        ))}
        <div className="flex flex-wrap justify-between gap-3 px-3 py-2">
          <span className="text-[11.5px] text-muted-foreground">
            Percentiles within peer group: {row.peerLabel}
          </span>
          <span className="font-mono text-[11.5px] text-muted-foreground">
            Coverage {row.coverage}
          </span>
        </div>
      </div>
    </div>
  );
}

const VECTOR_GRID = "grid grid-cols-[1.5fr_1.35fr_1.5fr_0.5fr] items-center gap-3";

function VectorRow({ cell }: { cell: VectorCell }) {
  return (
    <div className={`${VECTOR_GRID} border-b border-grid px-3 py-2.5 last:border-b-0`}>
      <span className="text-[13px] text-body">{cell.label}</span>
      <span className="flex items-center gap-2">
        {/* Grey, always: a percentile bar is a length, not a grade. */}
        <span className="h-[3px] w-13 overflow-hidden rounded-sm bg-white/8">
          <span
            className="block h-[3px] bg-muted-foreground"
            style={{ width: `${cell.barPercent}%` }}
          />
        </span>
        <span
          className={`font-mono text-xs whitespace-nowrap ${cell.missing ? "text-muted-foreground" : "text-body"}`}
        >
          {cell.percentile}
        </span>
      </span>
      <span className="text-right font-mono text-[12.5px] text-foreground">{cell.raw}</span>
      <span className="text-right font-mono text-xs text-muted-foreground">{cell.weight}</span>
    </div>
  );
}

function HeadCell({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={`text-[10px] font-medium tracking-[0.07em] text-muted-foreground uppercase ${className}`}
    >
      {children}
    </span>
  );
}
