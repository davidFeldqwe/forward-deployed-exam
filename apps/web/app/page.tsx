import { redirect } from "next/navigation";

import { chatDestination } from "@/app/auth-gate";
import { currentSession } from "@/app/auth-session";
import { latestThreadId } from "@/app/thread-store";
import { Landing } from "@/components/Landing";

export default async function LandingPage() {
  const session = await currentSession();
  if (session) {
    redirect(chatDestination(latestThreadId(session.email)));
  }

  return <Landing />;
}
