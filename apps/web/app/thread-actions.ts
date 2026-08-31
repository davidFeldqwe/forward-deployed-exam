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
import { textField } from "@/app/form-fields";
import { recordQuestion } from "@/app/threads";

/**
 * Persists a question from the composer and shows the Thread it landed in —
 * `recordQuestion` decides whether that is a new thread or a follow-up, and
 * never discards the question. A blank question leaves the page as it stands.
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

  const thread = recordQuestion(
    session.email,
    textField(formData, "threadId") || null,
    question,
  );

  redirect(chatDestination(thread?.id ?? null));
}
