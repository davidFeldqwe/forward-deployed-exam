"use client";

import { useFormStatus } from "react-dom";

import { PENDING_THREAD_ANSWER } from "@/app/thread-answer";
import { ThreadAnswer } from "@/components/answers/ThreadAnswer";
import { AssistantTurn, UserTurn } from "@/components/Turn";

/**
 * The question on its way, and the Thread answer under it (PRD story 35). It is
 * drawn while the SSE ask is in flight: the question is a user turn, and the
 * answer under it is `PENDING_THREAD_ANSWER`, which is what says there is no
 * number in this turn to read.
 */
export function PendingAnswer({ question }: { question: string }) {
  const { pending } = useFormStatus();
  if (!pending) {
    return null;
  }
  const asked = question.trim();

  return (
    <div className="flex flex-col gap-6 pt-6">
      {asked.length > 0 ? <UserTurn text={asked} /> : null}
      <AssistantTurn>
        <ThreadAnswer parts={PENDING_THREAD_ANSWER} />
      </AssistantTurn>
    </div>
  );
}
