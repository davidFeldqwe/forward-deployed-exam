"use server";

import { redirect } from "next/navigation";

import {
  type CredentialErrors,
  authenticate,
  createAccount,
} from "@/app/auth-accounts";
import { LOGIN_PATH, postLoginPath } from "@/app/auth-gate";
import { endSession, startSession } from "@/app/auth-session";

export type LoginState = {
  email: string;
  errors: CredentialErrors;
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function submitLogin(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = field(formData, "email");
  const password = field(formData, "password");
  const result =
    field(formData, "mode") === "signUp"
      ? createAccount(email, password)
      : authenticate(email, password);

  if (!result.ok) {
    return { email, errors: result.errors };
  }

  await startSession(result.email);
  redirect(postLoginPath(field(formData, "next")));
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect(LOGIN_PATH);
}
