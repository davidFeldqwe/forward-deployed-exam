import { redirect } from "next/navigation";

import {
  CHAT_PATH,
  carriedPrompt,
  chatPathWithPrompt,
  loginRedirect,
} from "@/app/auth-gate";
import { currentSession } from "@/app/auth-session";
import { Chat } from "@/components/Chat";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string | string[] }>;
}) {
  const { prompt } = await searchParams;
  const carried = carriedPrompt(prompt);

  if (!(await currentSession())) {
    redirect(loginRedirect(carried ? chatPathWithPrompt(carried) : CHAT_PATH));
  }

  return <Chat initialPrompt={carried} />;
}
