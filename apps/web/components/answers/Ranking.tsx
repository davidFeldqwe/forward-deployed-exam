import { lampPill } from "@/app/lamp-hue";
import {
  WITHHELD_COMPOSITE,
  type RankingRowView,
  type RankingView,
  type VectorCell,
} from "@/app/ranking-view";
import { HeadCell } from "@/components/answers/HeadCell";
import { LampLegend } from "@/components/answers/LampLegend";
import {
  RANKING_AIRPORT,
  RANKING_RANK,
  RANKING_STRIP,
} from "@/components/answers/ranking-strip";

const CHEVRON = "w-[14px] shrink-0";

const AIRPORT_LABELS = "flex min-w-0 flex-wrap items-baseline gap-2";

const AIRPORT_CELL = `${RANKING_AIRPORT} ${AIRPORT_LABELS}`;

const LOOKUP_GRID = "grid grid-cols-[26px_minmax(0,1fr)_minmax(0,max-content)] items-center gap-3";

const VECTOR_GRID =
  "grid grid-cols-2 items-center gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.35fr)_minmax(0,1.5fr)_minmax(0,auto)]";

/**
 * The ranking table (PRD stories 23-24), rendered from the `queryAirports`
 * payload. Each row's score vector is collapsed on the row and expands in
 * place: the numbers open under the airport they belong to, not on another
 * screen.
 *
 * A single-metric lookup (story 30) is the same rows drawn one column wide: the
 * number that was asked for, and no composite, no candidate lamp and no legend
 * for one — a lookup is not an investment recommendation, so it is not dressed
 * as one.
 */
export function Ranking({
  rows,
  lookup,
  sortLabel,
}: {
  rows: RankingRowView[];
  lookup: RankingView["lookup"];
  sortLabel: string;
}) {
  if (rows.length === 0) {
    return null;
  }
  return lookup ? (
    <LookupTable rows={rows} label={lookup.label} sortLabel={sortLabel} />
  ) : (
    <RankingTable rows={rows} sortLabel={sortLabel} />
  );
}

function RankingTable({ rows, sortLabel }: { rows: RankingRowView[]; sortLabel: string }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border bg-card">
      <div className={`${RANKING_STRIP} border-b bg-row-head py-2.5`}>
        <HeadCell className={RANKING_RANK}>#</HeadCell>
        <HeadCell className={RANKING_AIRPORT}>Airport</HeadCell>
        <HeadCell className="shrink-0 text-right">Composite</HeadCell>
        <HeadCell className="shrink-0">Candidate lamp</HeadCell>
        <span className={CHEVRON} />
      </div>
      {rows.map((row) => (
        <Row key={row.iata} row={row} />
      ))}
      <LampLegend />
      <p className="m-0 border-t border-grid px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
        Composite 0–100, sorted by {sortLabel} · percentile within the airport&apos;s FAA hub-size
        peer group, computed nationally. Open a row for its score vector.
      </p>
    </section>
  );
}

/** The lookup's three columns: the airport, and the one number asked for. */
function LookupTable({
  rows,
  label,
  sortLabel,
}: {
  rows: RankingRowView[];
  label: string;
  sortLabel: string;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border bg-card">
      <div className={`${LOOKUP_GRID} border-b bg-row-head px-3.5 py-2.5`}>
        <HeadCell>#</HeadCell>
        <HeadCell>Airport</HeadCell>
        <HeadCell className="text-right">{label}</HeadCell>
      </div>
      {rows.map((row) => (
        <LookupRow key={row.iata} row={row} />
      ))}
      <p className="m-0 border-t border-grid px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
        A single-metric lookup: {sortLabel} for each airport in the resolved set. No composite and no
        candidate lamp — one number is not a capacity-pressure screen result.
      </p>
    </section>
  );
}

/** One airport and the one number the lookup asked for. Nothing else. */
function LookupRow({ row }: { row: RankingRowView }) {
  return (
    <div className={`${LOOKUP_GRID} border-b border-grid px-3.5 py-3 last:border-b-0`}>
      <span className="font-mono text-xs text-muted-foreground/70">{row.rank}</span>
      <span className={AIRPORT_LABELS}>
        <span className="font-mono text-sm font-medium text-foreground">{row.iata}</span>
        <span className="text-[13.5px] text-body">{row.name}</span>
      </span>
      <span className="text-right font-mono text-[13.5px] text-foreground">{row.lookupValue}</span>
    </div>
  );
}

function Row({ row }: { row: RankingRowView }) {
  return (
    <details className="group border-b border-grid last:border-b-0">
      <summary
        data-ranking-row
        className={`${RANKING_STRIP} cursor-pointer list-none py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden`}
      >
        <span className={`${RANKING_RANK} font-mono text-xs text-muted-foreground/70`}>{row.rank}</span>
        <span className={AIRPORT_CELL}>
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
        <span className="flex shrink-0 items-baseline justify-end gap-1">
          <span className="font-mono text-[15px] font-medium text-foreground">{row.composite}</span>
          {row.composite === WITHHELD_COMPOSITE ? null : (
            <span className="text-[10px] text-muted-foreground/70">/100</span>
          )}
        </span>
        {/* Hue on the lamp, never instead of it: the words are always in the
            pill, and the legend under the table names all five of them. A
            ranked row always has one — only a lookup withholds the lamp, and a
            lookup is not drawn here — so the empty cell just holds the column. */}
        {row.lamp === null ? (
          <span className="shrink-0" />
        ) : (
          <span
            className={`shrink-0 rounded border px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${lampPill(row.lamp)}`}
          >
            {row.lamp}
          </span>
        )}
        <span className={`${CHEVRON} text-[10px] text-muted-foreground/70`}>
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
    <div className="bg-background px-3.5 pb-3.5 sm:pl-10">
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
