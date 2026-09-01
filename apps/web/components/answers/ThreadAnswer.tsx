import type { ReactElement } from "react";

import type { ProsePart, ThreadAnswerPart } from "@/app/thread-answer";
import { CarriedContext } from "@/components/answers/CarriedContext";
import { Caveats } from "@/components/answers/Caveats";
import { CompositeChart } from "@/components/answers/CompositeChart";
import { PendingRow } from "@/components/answers/PendingRow";
import { Ranking } from "@/components/answers/Ranking";
import { ReadAloud } from "@/components/answers/ReadAloud";
import { ResolvedMap } from "@/components/answers/ResolvedMap";
import { ResolvedSet } from "@/components/answers/ResolvedSet";
import { ToolRow } from "@/components/answers/ToolRow";
import { Prose } from "@/components/Turn";

/**
 * One assistant turn, drawn from its **Thread answer** list. The order is the
 * list's (`app/thread-answer.ts`); this file only says what each tag looks
 * like, so nothing here can group the blocks differently from what the order
 * tests assert.
 */
export function ThreadAnswer({ parts }: { parts: readonly ThreadAnswerPart[] }) {
  return parts.map((part, index) => <Part key={index} part={part} />);
}

/** One tag, drawn. The return type is what makes a tag with no case an error. */
function Part({ part }: { part: ThreadAnswerPart }): ReactElement {
  switch (part.tag) {
    case "tool":
      return <ToolRow call={part.call} />;
    case "carried":
      return <CarriedContext carried={part.carried} />;
    case "resolved":
      return <ResolvedSet resolved={part.resolved} unknown={part.unknown} />;
    case "prose":
      return <ProseBlock part={part} />;
    case "ranking":
      return <Ranking rows={part.rows} lookup={part.lookup} sortLabel={part.sortLabel} />;
    case "map":
      return <ResolvedMap map={part.map} />;
    case "chart":
      return <CompositeChart chart={part.chart} />;
    case "pending":
      return <PendingRow row={part} />;
    case "caveats":
      return <Caveats assumptions={part.assumptions} gaps={part.gaps} />;
  }
}

function ProseBlock({ part }: { part: ProsePart }) {
  return (
    <div className="flex flex-col gap-2">
      {part.heading ? (
        <span className="flex items-center gap-2 text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {part.heading}
          <span aria-hidden className="h-px flex-1 bg-grid" />
        </span>
      ) : null}
      <Prose text={part.text} />
      {/* Read aloud sits with the prose it speaks, under it and above the table
          it does not. */}
      {part.spoken ? <ReadAloud text={part.spoken} /> : null}
    </div>
  );
}
