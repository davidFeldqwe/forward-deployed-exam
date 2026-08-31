import { redirect } from "next/navigation";

import { CHAT_PATH, chatDestination, loginRedirect } from "@/app/auth-gate";
import { currentSession } from "@/app/auth-session";
import { listThreads, readThread } from "@/app/threads";
import { Chat } from "@/components/Chat";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const session = await currentSession();

  if (!session) {
    redirect(loginRedirect(chatDestination(threadId)));
  }

  const thread = readThread(session.email, threadId);
  if (!thread) {
    // Someone else's thread, or one this process no longer holds.
    redirect(CHAT_PATH);
  }

  return (
    <Chat
      threadId={thread.id}
      messages={thread.messages}
      recents={listThreads(session.email)}
    />
  );
}
