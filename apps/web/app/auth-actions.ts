"use server";

import { redirect } from "next/navigation";

import {
  type CredentialErrors,
  attemptLogin,
} from "@/app/auth-accounts";
import { LOGIN_PATH, postLoginPath } from "@/app/auth-gate";
import { endSession, startSession } from "@/app/auth-session";
import { textField } from "@/app/form-fields";

export type LoginState = {
  email: string;
  errors: CredentialErrors;
};

export async function submitLogin(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = textField(formData, "email");
  const password = textField(formData, "password");
  const result = attemptLogin(
    textField(formData, "mode") === "signUp" ? "signUp" : "signIn",
    email,
    password,
  );

  if (!result.ok) {
    return { email, errors: result.errors };
  }

  await startSession(result.email);
  redirect(postLoginPath(textField(formData, "next")));
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect(LOGIN_PATH);
}
