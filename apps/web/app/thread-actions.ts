"use server";

import { redirect } from "next/navigation";

import {
  CHAT_PATH,
  carriedPrompt,
  chatDestination,
  chatPathWithPrompt,
  loginRedirect,
} from "@/app/auth-gate";
import { currentSession } from "@/app/auth-session";
import { appendMessage, startThread, userMessage } from "@/app/threads";

function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Persists a question and shows the Thread it belongs to. A question with no
 * thread starts one, titled with that question; a question in an open thread is
 * appended, so a follow-up keeps the ranking it is following up on.
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

  const openThreadId = textField(formData, "threadId");
  const thread = openThreadId
    ? appendMessage(session.email, openThreadId, userMessage(question))
    : startThread(session.email, question);

  // A thread this account does not own is simply not there.
  redirect(thread ? chatDestination(thread.id) : CHAT_PATH);
}
