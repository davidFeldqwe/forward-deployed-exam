import { threadAnswer } from "@/app/thread-answer";
import type { ThreadMessage } from "@/app/thread-messages";
import { ThreadAnswer } from "@/components/answers/ThreadAnswer";
import { RoleLabel, UserTurn } from "@/components/Turn";

/**
 * The persisted message list. A question is the analyst's words; an answer is
 * its **Thread answer** — the ordered list of tags `app/thread-answer.ts`
 * composes, drawn tag by tag. Everything but the prose is rendered from the
 * tool payloads the message carries, so a sentence that disagrees with the
 * table is visibly the sentence that is wrong.
 */
export function Transcript({ messages }: { messages: readonly ThreadMessage[] }) {
  return (
    <ol className="flex list-none flex-col gap-6 p-0">
      {messages.map((message, index) => (
        <li key={index}>
          {message.role === "assistant" ? (
            <div className="flex flex-col gap-3">
              <RoleLabel role="assistant" />
              <ThreadAnswer parts={threadAnswer(messages, index)} />
            </div>
          ) : (
            <UserTurn text={message.text} />
          )}
        </li>
      ))}
    </ol>
  );
}
