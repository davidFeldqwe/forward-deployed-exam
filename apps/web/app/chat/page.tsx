import { redirect } from "next/navigation";

import {
  CHAT_PATH,
  carriedPrompt,
  chatPathWithPrompt,
  loginRedirect,
} from "@/app/auth-gate";
import { currentSession } from "@/app/auth-session";
import { listThreads } from "@/app/threads";
import { Chat } from "@/components/Chat";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string | string[] }>;
}) {
  const { prompt } = await searchParams;
  const carried = carriedPrompt(prompt);
  const session = await currentSession();

  if (!session) {
    redirect(loginRedirect(carried ? chatPathWithPrompt(carried) : CHAT_PATH));
  }

  // An empty chat: the next question starts a Thread rather than joining one.
  return <Chat initialPrompt={carried} recents={listThreads(session.email)} />;
}
