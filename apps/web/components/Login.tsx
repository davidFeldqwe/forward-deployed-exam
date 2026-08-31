"use client";

import { useActionState, useState } from "react";

import { type LoginState, submitLogin } from "@/app/auth-actions";
import { loginCopy } from "@/app/login-copy";

type LoginMode = "signIn" | "signUp";

const emptyLoginState: LoginState = { email: "", errors: {} };

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
  const other: LoginMode = mode === "signIn" ? "signUp" : "signIn";

  return (
    <div className="login">
      <header className="login-header">
        <div className="login-column login-header-inner">
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

              {loginCopy.fields.map((field) => {
                const error = state.errors[field.name];
                const errorId = `${field.name}-error`;
                return (
                  <div key={field.name} className="login-field">
                    <label htmlFor={field.name}>{field.label}</label>
                    <input
                      id={field.name}
                      name={field.name}
                      type={field.type}
                      required
                      defaultValue={field.name === "email" ? state.email : ""}
                      autoComplete={
                        field.name === "password" && mode === "signUp"
                          ? "new-password"
                          : field.autoComplete
                      }
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                    />
                    {error ? (
                      <p id={errorId} className="login-error" role="alert">
                        {error}
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
                onClick={() => setMode(other)}
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
