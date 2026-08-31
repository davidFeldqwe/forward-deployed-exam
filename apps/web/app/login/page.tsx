import { redirect } from "next/navigation";

import { postLoginPath, promptFromPath } from "@/app/auth-gate";
import { currentSession } from "@/app/auth-session";
import { Login } from "@/components/Login";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const destination = postLoginPath(next);

  if (await currentSession()) {
    redirect(destination);
  }

  return <Login next={destination} carriedPrompt={promptFromPath(destination)} />;
}
