"use client";

import type { ChatStreamState } from "@/app/chat-stream";
import { inFlightThreadAnswer } from "@/app/thread-answer";
import type { ThreadMessage } from "@/app/thread-messages";
import { ThreadAnswer } from "@/components/answers/ThreadAnswer";
import { AssistantTurn, UserTurn } from "@/components/Turn";

/**
 * The question on its way, and the Thread answer under it (PRD story 35). Chat
 * keeps this mounted until the landed transcript replaces it, so Send does not
 * leave a blank gap. Until a complete `queryAirports` payload, the list is the
 * pending row (no number to read). Complete tool rows and prose deltas may
 * join it; ranking still comes from that payload, never from a sentence.
 */
export function PendingAnswer({
  question,
  messages,
  stream,
}: {
  question: string;
  messages: readonly ThreadMessage[];
  stream: ChatStreamState;
}) {
  const asked = question.trim();
  if (asked.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6 pt-6">
      <UserTurn text={asked} />
      <AssistantTurn>
        <div className="stream-enter flex flex-col gap-3">
          <ThreadAnswer parts={inFlightThreadAnswer(messages, asked, stream.text, stream.toolCalls)} />
        </div>
      </AssistantTurn>
    </div>
  );
}
