"use server";

import { redirect } from "next/navigation";

import { CHAT_PATH, chatDestination, loginRedirect } from "@/app/auth-gate";
import { currentSession } from "@/app/auth-session";
import { openEmptyThread } from "@/app/thread-store";

/**
 * New thread in the rail: persist an empty Thread, then open it so recents
 * shows the row immediately. A second click reuses the empty one.
 */
export async function openNewThread(): Promise<void> {
  const session = await currentSession();
  if (!session) {
    redirect(loginRedirect(CHAT_PATH));
  }
  const thread = await openEmptyThread(session.email);
  redirect(chatDestination(thread.id));
}
