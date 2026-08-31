"use client";

import { useActionState, useState } from "react";

import { type LoginState, submitLogin } from "@/app/auth-actions";
import { loginCopy } from "@/app/login-copy";

type LoginMode = "signIn" | "signUp";

const emptyLoginState: LoginState = { email: "", errors: {} };

/**
 * The fields as this mode and this attempt need them: signup asks the browser
 * for a new password, and a refused attempt hands back the typed email — React
 * resets the form, so the password is always retyped.
 */
function fieldsToRender(mode: LoginMode, state: LoginState) {
  return loginCopy.fields.map((field) => ({
    ...field,
    autoComplete:
      field.name === "password" && mode === "signUp"
        ? "new-password"
        : field.autoComplete,
    defaultValue: field.name === "email" ? state.email : "",
    error: state.errors[field.name],
  }));
}

export function Login({
  next,
  carriedPrompt,
}: {
  next: string;
  carriedPrompt: string | null;
}) {
  const [mode, setMode] = useState<LoginMode>("signIn");
  const [state, action, pending] = useActionState(submitLogin, emptyLoginState);
  const copy = loginCopy[mode];
  const otherMode: LoginMode = mode === "signIn" ? "signUp" : "signIn";

  return (
    <div className="login">
      <header className="login-header">
        <div className="login-header-inner">
          <div className="wordmark">
            <span className="wordmark-mark" aria-hidden="true" />
            <span className="wordmark-name">{loginCopy.wordmark}</span>
          </div>
        </div>
      </header>

      <main className="login-main">
        <div className="login-column">
          <div className="login-card">
            <h1 className="login-heading">{copy.heading}</h1>
            <p className="login-subtitle">{loginCopy.subtitle}</p>

            {carriedPrompt ? (
              <div className="login-carried">
                <span className="login-carried-label">
                  {loginCopy.carriedPromptLabel}
                </span>
                <p className="login-carried-prompt">{carriedPrompt}</p>
              </div>
            ) : null}

            <form action={action} className="login-form">
              <input type="hidden" name="mode" value={mode} />
              <input type="hidden" name="next" value={next} />

              {fieldsToRender(mode, state).map((field) => {
                const errorId = `${field.name}-error`;
                return (
                  <div key={field.name} className="login-field">
                    <label htmlFor={field.name}>{field.label}</label>
                    <input
                      id={field.name}
                      name={field.name}
                      type={field.type}
                      required
                      defaultValue={field.defaultValue}
                      autoComplete={field.autoComplete}
                      aria-invalid={field.error ? true : undefined}
                      aria-describedby={field.error ? errorId : undefined}
                    />
                    {field.error ? (
                      <p id={errorId} className="login-error" role="alert">
                        {field.error}
                      </p>
                    ) : null}
                  </div>
                );
              })}

              <button type="submit" className="login-submit" disabled={pending}>
                {pending ? copy.pendingLabel : copy.submitLabel}
              </button>
            </form>

            <p className="login-switch">
              {copy.switchPrompt}{" "}
              <button
                type="button"
                className="login-switch-action"
                onClick={() => setMode(otherMode)}
              >
                {copy.switchLabel}
              </button>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
