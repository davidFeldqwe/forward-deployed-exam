/**
 * Assumptions and data gaps for this answer (PRD story 34), attached to the
 * rows it showed rather than to a footer the analyst has to go find.
 */
export function Caveats({ assumptions, gaps }: { assumptions: string[]; gaps: string[] }) {
  if (assumptions.length === 0 && gaps.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2.5 rounded-lg border bg-card px-4 py-3.5">
      <span className="text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Assumptions &amp; data gaps
      </span>
      <List lines={assumptions} />
      <List lines={gaps} />
    </section>
  );
}

function List({ lines }: { lines: string[] }) {
  if (lines.length === 0) {
    return null;
  }
  return (
    <ul className="flex list-none flex-col gap-1.5 p-0">
      {lines.map((line) => (
        <li key={line} className="flex gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
          <span aria-hidden className="text-muted-foreground/50">
            ·
          </span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}
