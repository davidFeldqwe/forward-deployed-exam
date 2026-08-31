"use client";

import { useFormStatus } from "react-dom";

import { PENDING_THREAD_ANSWER } from "@/app/thread-answer";
import { ThreadAnswer } from "@/components/answers/ThreadAnswer";
import { Prose, RoleLabel } from "@/components/Turn";

/**
 * The question on its way, and the Thread answer under it (PRD story 35). It is
 * drawn only while the composer's form is in flight: the question is a user
 * turn, and the answer under it is `PENDING_THREAD_ANSWER` — a pending row, and
 * no tag that could hold a composite, a candidate lamp or a score vector.
 */
export function PendingAnswer({ question }: { question: string }) {
  const { pending } = useFormStatus();
  if (!pending) {
    return null;
  }
  const asked = question.trim();

  return (
    <div className="flex flex-col gap-6 pt-6">
      {asked.length > 0 ? (
        <div className="flex flex-col gap-3">
          <RoleLabel role="user" />
          <Prose text={asked} />
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <RoleLabel role="assistant" />
        <ThreadAnswer parts={PENDING_THREAD_ANSWER} />
      </div>
    </div>
  );
}
