"use client";

import { useActionState, useState } from "react";

import { type LoginState, submitLogin } from "@/app/auth-actions";
import { loginCopy } from "@/app/login-copy";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
    <div className="flex min-h-svh flex-col">
      <header className="h-12 shrink-0 border-b bg-header">
        <div className="mx-auto flex h-full max-w-[720px] items-center px-6">
          <Wordmark name={loginCopy.wordmark} />
        </div>
      </header>

      <main
        className="flex flex-1 items-center bg-[linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] bg-[size:28px_28px] py-12"
      >
        <div className="mx-auto w-full max-w-[420px] px-6">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-xl font-medium tracking-[-0.02em]">
                {copy.heading}
              </CardTitle>
              <CardDescription>{loginCopy.subtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              {carriedPrompt ? (
                <div className="mb-5 rounded-lg border bg-raised px-3.5 py-3">
                  <span className="mb-1.5 block text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
                    {loginCopy.carriedPromptLabel}
                  </span>
                  <p className="m-0 font-mono text-[12.5px] leading-snug text-foreground">
                    {carriedPrompt}
                  </p>
                </div>
              ) : null}

              <form action={action} className="flex flex-col gap-4">
                <input type="hidden" name="mode" value={mode} />
                <input type="hidden" name="next" value={next} />

                {fieldsToRender(mode, state).map((field) => {
                  const errorId = `${field.name}-error`;
                  return (
                    <div key={field.name} className="flex flex-col gap-1.5">
                      <label
                        htmlFor={field.name}
                        className="text-xs font-medium text-muted-foreground"
                      >
                        {field.label}
                      </label>
                      <Input
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
                        <p id={errorId} className="m-0 text-xs leading-snug text-body" role="alert">
                          {field.error}
                        </p>
                      ) : null}
                    </div>
                  );
                })}

                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? copy.pendingLabel : copy.submitLabel}
                </Button>
              </form>

              <p className="mt-4.5 mb-0 text-[13px] text-muted-foreground">
                {copy.switchPrompt}{" "}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={() => setMode(otherMode)}
                >
                  {copy.switchLabel}
                </Button>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
