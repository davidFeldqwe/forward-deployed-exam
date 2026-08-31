import type { RankingUnknowns, ResolvedSet as ResolvedSetView } from "@/app/ranking-view";

/**
 * The resolved airport set, named before the ranking (PRD story 22): which
 * airports the place phrase became, all of them, including the ones past the
 * limit the table pages to.
 */
export function ResolvedSet({
  resolved,
  unknown,
}: {
  resolved: ResolvedSetView;
  unknown: RankingUnknowns;
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded-lg border bg-card px-4 py-3.5">
      <span className="text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Resolved airport set
      </span>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-sm font-medium text-foreground">{resolved.phrase}</span>
        <span className="text-[13px] text-muted-foreground/70">→</span>
        <span className="font-mono text-[13px] text-muted-foreground">
          {resolved.codes.length === 0 ? "no airports" : `${resolved.codes.length} matched`}
        </span>
      </div>
      {resolved.codes.length > 0 ? (
        <ul className="flex list-none flex-wrap gap-1.5 p-0">
          {resolved.codes.map((code) => (
            <li
              key={code}
              className="rounded border bg-raised px-1.5 py-0.5 font-mono text-xs text-body"
            >
              {code}
            </li>
          ))}
        </ul>
      ) : null}
      <span className="text-[12.5px] text-muted-foreground">{resolved.summary}</span>
      {/* The refusals are locked copy on the answer object (stories 31-32), not
          a sentence composed here or left to the prose: an analyst is told what
          the screen accepts even when the model does not say it. */}
      {unknown.placeRefusal ? (
        <span className="text-[12.5px] text-body">{unknown.placeRefusal}</span>
      ) : null}
      {unknown.iataRefusal ? (
        <span className="text-[12.5px] text-body">{unknown.iataRefusal}</span>
      ) : null}
    </section>
  );
}
