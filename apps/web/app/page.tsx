import { redirect } from "next/navigation";

import { chatDestination } from "@/app/auth-gate";
import { currentSession } from "@/app/auth-session";
import { Landing } from "@/components/Landing";

export default async function LandingPage() {
  if (await currentSession()) {
    // Threads land in #20; until then a signed-in analyst gets an empty chat.
    redirect(chatDestination(null));
  }

  return <Landing />;
}
