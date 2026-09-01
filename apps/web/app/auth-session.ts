import { cookies } from "next/headers";

import { sessionIfAccountLive } from "@/app/auth-accounts";
import {
  SESSION_MAX_AGE_SECONDS,
  type Session,
  signSessionToken,
} from "@/app/auth-token";

const SESSION_COOKIE = "aii_session";

function sessionSecret(): string {
  const configured = process.env.AUTH_SECRET;
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required to sign session cookies.");
  }
  return "dev-only-session-secret";
}

export async function currentSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? await sessionIfAccountLive(token, sessionSecret()) : null;
}

export async function startSession(email: string): Promise<void> {
  (await cookies()).set({
    name: SESSION_COOKIE,
    value: signSessionToken(email, sessionSecret()),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
