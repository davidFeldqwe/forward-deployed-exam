import type { LoginState } from "./auth-actions.ts";
import { loginCopy } from "./login-copy.ts";

export type LoginMode = "signIn" | "signUp";

export type LoginEmailField = {
  name: "email";
  label: "Email";
  type: "email";
  autoComplete: "email";
  value: string;
  error: string | undefined;
};

export type LoginPasswordField = {
  name: "password";
  label: "Password";
  type: "password";
  autoComplete: "current-password" | "new-password";
  defaultValue: "";
  error: string | undefined;
};

export type LoginFieldView = LoginEmailField | LoginPasswordField;

/**
 * Email is restored from the refused attempt (and from typing) as a controlled
 * value. Password stays an empty default so a form reset never echoes the secret,
 * and so Base UI is not handed a new FieldControl default after init.
 */
export function loginFieldsToRender(
  mode: LoginMode,
  state: LoginState,
  email: string,
): LoginFieldView[] {
  return loginCopy.fields.map((field): LoginFieldView => {
    switch (field.name) {
      case "email":
        return {
          ...field,
          value: email,
          error: state.errors.email,
        };
      case "password":
        return {
          ...field,
          autoComplete: mode === "signUp" ? "new-password" : field.autoComplete,
          defaultValue: "",
          error: state.errors.password,
        };
    }
  });
}
