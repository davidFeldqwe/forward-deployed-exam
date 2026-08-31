import { rankingView, type RankingView } from "@/app/ranking-view";
import type { ThreadMessage } from "@/app/thread-messages";
import { Caveats } from "@/components/answers/Caveats";
import { Ranking } from "@/components/answers/Ranking";
import { ResolvedSet } from "@/components/answers/ResolvedSet";
import { ToolRow } from "@/components/answers/ToolRow";

const roleLabel: Record<ThreadMessage["role"], string> = {
  user: "You",
  assistant: "Agent",
};

/**
 * The persisted message list. An answer is drawn in the locked order: the
 * inspectable tool rows, the resolved airport set, the model's prose, the
 * ranking, and this answer's caveats. Everything but the prose is rendered from
 * the tool payloads the message carries, so a sentence that disagrees with the
 * table is visibly the sentence that is wrong.
 */
export function Transcript({ messages }: { messages: readonly ThreadMessage[] }) {
  return (
    <ol className="flex list-none flex-col gap-6 p-0">
      {messages.map((message, index) => (
        <li key={index} className="flex flex-col gap-3">
          <span className="font-mono text-[11.5px] tracking-wide text-muted-foreground uppercase">
            {roleLabel[message.role]}
          </span>
          {message.role === "assistant" ? (
            <Answer message={message} />
          ) : (
            <Prose text={message.text} />
          )}
        </li>
      ))}
    </ol>
  );
}

function Answer({ message }: { message: ThreadMessage }) {
  const rankings = message.toolCalls
    .map((call) => rankingView(call))
    .filter((view): view is RankingView => view !== null);

  return (
    <>
      {message.toolCalls.map((call, index) => (
        <ToolRow key={`${call.tool}-${index}`} call={call} />
      ))}
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
        </div>
      ) : null}
      {rankings.map((view, index) => (
        <Ranking key={index} rows={view.rows} sortLabel={view.sortLabel} />
      ))}
      <Caveats
        assumptions={mergedLines(rankings, "assumptions")}
        gaps={mergedLines(rankings, "gaps")}
      />
    </>
  );
}

function Prose({ text }: { text: string }) {
  return <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-body">{text}</p>;
}

// One caveats block per answer, even when the answer ran two queries.
function mergedLines(views: RankingView[], key: "assumptions" | "gaps"): string[] {
  return [...new Set(views.flatMap((view) => view[key]))];
}
