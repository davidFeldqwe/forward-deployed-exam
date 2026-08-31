import { Fragment } from "react";

import { carriedContext, type CarriedContext as CarriedContextView } from "@/app/carried-context";
import { rankingView, type RankingView } from "@/app/ranking-view";
import { resolvedMap, type ResolvedMapView } from "@/app/resolved-map";
import { previousQuestion, type ThreadMessage, type ToolCall } from "@/app/thread-messages";
import { CarriedContext } from "@/components/answers/CarriedContext";
import { Caveats } from "@/components/answers/Caveats";
import { Ranking } from "@/components/answers/Ranking";
import { ResolvedMap } from "@/components/answers/ResolvedMap";
import { ResolvedSet } from "@/components/answers/ResolvedSet";
import { ToolRow } from "@/components/answers/ToolRow";
import { Prose, RoleLabel } from "@/components/Turn";

/**
 * The persisted message list. An answer is drawn in the locked order: the
 * inspectable tool rows, the carried context a follow-up resolved, the resolved
 * airport set, the model's prose, the ranking, the map of the rows it just
 * ranked when this question named a place, and this answer's caveats.
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
              question={previousQuestion(messages, index)}
              carried={carriedContext(messages, index)}
            />
          ) : (
            <Prose text={message.text} />
          )}
        </li>
      ))}
    </ol>
  );
}

/** One ranking payload, as the table draws it and as the map places it. */
type RankedAnswer = { view: RankingView; map: ResolvedMapView | null };

function Answer({
  message,
  question,
  carried,
}: {
  message: ThreadMessage;
  /** The question this answer replies to: what the map gate reads. */
  question: string | null;
  carried: CarriedContextView | null;
}) {
  const rankings = message.toolCalls
    .map((call) => rankedAnswer(question, call))
    .filter((answer): answer is RankedAnswer => answer !== null);

  return (
    <>
      {message.toolCalls.map((call, index) => (
        <ToolRow key={`${call.tool}-${index}`} call={call} />
      ))}
      {/* Before the resolved set and the vector under it: how the follow-up
          reference was resolved comes before any number read for it. */}
      {carried ? <CarriedContext carried={carried} /> : null}
      {rankings.map(({ view }, index) => (
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
        </div>
      ) : null}
      {/* The map goes after the table it is a picture of, and carries no
          number of its own: the rows above it are the answer. */}
      {rankings.map(({ view, map }, index) => (
        <Fragment key={index}>
          <Ranking rows={view.rows} lookup={view.lookup} sortLabel={view.sortLabel} />
          {map ? <ResolvedMap map={map} /> : null}
        </Fragment>
      ))}
      <Caveats
        assumptions={mergedLines(rankings, "assumptions")}
        gaps={mergedLines(rankings, "gaps")}
      />
    </>
  );
}

/** The answer objects for one tool call, or null when it is not a ranking. */
function rankedAnswer(question: string | null, call: ToolCall): RankedAnswer | null {
  const view = rankingView(call);
  return view === null ? null : { view, map: resolvedMap(question, call) };
}

// One caveats block per answer, even when the answer ran two queries.
function mergedLines(answers: RankedAnswer[], key: "assumptions" | "gaps"): string[] {
  return [...new Set(answers.flatMap((answer) => answer.view[key]))];
}
