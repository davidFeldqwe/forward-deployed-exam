"use server";

import { redirect } from "next/navigation";

import { answerQuestion } from "@/app/agent";
import {
  CHAT_PATH,
  carriedPrompt,
  chatDestination,
  chatPathWithPrompt,
  loginRedirect,
} from "@/app/auth-gate";
import { currentSession } from "@/app/auth-session";
import { textField } from "@/app/form-fields";
import { askOnThread } from "@/app/thread-store";

/**
 * Persists a question from the composer, answers it, and shows the Thread both
 * landed in — `askOnThread` decides whether that is a new thread or a follow-up,
 * and never discards the question. A blank question leaves the page as it
 * stands.
 *
 * The question is stored before the agent runs, so a model that fails or times
 * out loses the answer and not the question. `answerQuestion` returns a message
 * for every path it has, and the store writes its own line when it refuses one,
 * so the thread never comes back with a user turn and no reply.
 *
 * One ask at a time per Thread is the store's rule, not this action's: a second
 * tab posting the same form does not pass through the composer's held Send, and
 * the SSE route will not pass through this action at all.
 */
export async function askQuestion(formData: FormData): Promise<void> {
  const question = carriedPrompt(textField(formData, "prompt"));
  const session = await currentSession();

  if (!session) {
    redirect(loginRedirect(question ? chatPathWithPrompt(question) : CHAT_PATH));
  }
  if (!question) {
    return;
  }

  const thread = await askOnThread(
    session.email,
    textField(formData, "threadId") || null,
    question,
    (thread) => answerQuestion(thread.messages),
  );

  redirect(chatDestination(thread?.id ?? null));
}
