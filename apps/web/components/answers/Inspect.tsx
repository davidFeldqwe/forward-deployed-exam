import { SHOW_MORE_LABEL, type InspectPart } from "@/app/thread-answer";
import { ResolvedSet } from "@/components/answers/ResolvedSet";
import { ToolRow } from "@/components/answers/ToolRow";

/**
 * The agent-run chrome for one turn (issue #94): tool rows and the resolved
 * airport set, collapsed behind one Show more so the answer reads as prose
 * first. Opening it is what makes the inspectable payload visible (story 33).
 */
export function Inspect({ inspect }: { inspect: InspectPart }) {
  return (
    <details className="group overflow-hidden rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="text-[10px] text-muted-foreground/70">
          <span className="group-open:hidden">▸</span>
          <span className="hidden group-open:inline">▾</span>
        </span>
        <span className="text-xs text-muted-foreground">{SHOW_MORE_LABEL}</span>
      </summary>
      <div className="flex flex-col gap-3 border-t bg-background px-3 py-3">
        {inspect.calls.map((call, index) => (
          <ToolRow key={index} call={call} />
        ))}
        {inspect.sets.map((set, index) => (
          <ResolvedSet key={index} resolved={set.resolved} unknown={set.unknown} />
        ))}
      </div>
    </details>
  );
}
