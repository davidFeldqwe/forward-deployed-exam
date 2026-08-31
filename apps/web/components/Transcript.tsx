import { carriedContext, type CarriedContext as CarriedContextView } from "@/app/carried-context";
import { rankingView, type RankingView } from "@/app/ranking-view";
import { spokenProse } from "@/app/read-aloud";
import type { ThreadMessage } from "@/app/thread-messages";
import { CarriedContext } from "@/components/answers/CarriedContext";
import { Caveats } from "@/components/answers/Caveats";
import { Ranking } from "@/components/answers/Ranking";
import { ReadAloud } from "@/components/answers/ReadAloud";
import { ResolvedSet } from "@/components/answers/ResolvedSet";
import { ToolRow } from "@/components/answers/ToolRow";
import { Prose, RoleLabel } from "@/components/Turn";

/**
 * The persisted message list. An answer is drawn in the locked order: the
 * inspectable tool rows, the carried context a follow-up resolved, the resolved
 * airport set, the model's prose, the ranking, and this answer's caveats.
 * Everything but the prose is rendered from the tool payloads the message
 * carries, so a sentence that disagrees with the table is visibly the sentence
 * that is wrong.
 */
export function Transcript({ messages }: { messages: readonly ThreadMessage[] }) {
  return (
    <ol className="flex list-none flex-col gap-6 p-0">
      {messages.map((message, index) => (
        <li key={index} className="flex flex-col gap-3">
          <RoleLabel role={message.role} />
          {message.role === "assistant" ? (
            <Answer
              message={message}
              carried={carriedContext(messages, index)}
              spoken={spokenProse(messages, index)}
            />
          ) : (
            <Prose text={message.text} />
          )}
        </li>
      ))}
    </ol>
  );
}

function Answer({
  message,
  carried,
  spoken,
}: {
  message: ThreadMessage;
  carried: CarriedContextView | null;
  /** This answer's prose, when it is the one the read-aloud control speaks. */
  spoken: string | null;
}) {
  const rankings = message.toolCalls
    .map((call) => rankingView(call))
    .filter((view): view is RankingView => view !== null);

  return (
    <>
      {message.toolCalls.map((call, index) => (
        <ToolRow key={`${call.tool}-${index}`} call={call} />
      ))}
      {/* Before the resolved set and the vector under it: how the follow-up
          reference was resolved comes before any number read for it. */}
      {carried ? <CarriedContext carried={carried} /> : null}
      {rankings.map((view, index) => (
        <ResolvedSet key={index} resolved={view.resolved} unknown={view.unknown} />
      ))}
      {message.text ? (
        <div className="flex flex-col gap-2">
          {/* The label marks a boundary, so it is drawn only where there is
              something on the other side of it to tell the prose apart from. */}
          {rankings.length > 0 ? (
            <span className="flex items-center gap-2 text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              AI explanation
              <span aria-hidden className="h-px flex-1 bg-grid" />
            </span>
          ) : null}
          <Prose text={message.text} />
          {/* Read aloud sits with the prose it speaks, under it and above the
              table it does not. */}
          {spoken === null ? null : <ReadAloud text={spoken} />}
        </div>
      ) : null}
      {rankings.map((view, index) => (
        <Ranking key={index} rows={view.rows} lookup={view.lookup} sortLabel={view.sortLabel} />
      ))}
      <Caveats
        assumptions={mergedLines(rankings, "assumptions")}
        gaps={mergedLines(rankings, "gaps")}
      />
    </>
  );
}

// One caveats block per answer, even when the answer ran two queries.
function mergedLines(views: RankingView[], key: "assumptions" | "gaps"): string[] {
  return [...new Set(views.flatMap((view) => view[key]))];
}
