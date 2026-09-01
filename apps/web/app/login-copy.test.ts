import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { landingCopy } from "./landing-copy.ts";
import { loginCopy } from "./login-copy.ts";

function visibleText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(visibleText).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.values(value).map(visibleText).join("\n");
  }
  return "";
}

test("login wears the shared header, so abandoning it reaches the Landing", () => {
  // Login is a public surface, not a trap: the same bar other public pages
  // wear, and no second centred strip that cannot go home.
  const login = readFileSync(
    new URL("../components/Login.tsx", import.meta.url),
    "utf8",
  );

  assert.equal("wordmark" in loginCopy, false);
  assert.match(login, /<SiteHeader\s+signedIn=\{false\}/);
  assert.doesNotMatch(login, /<header/);
  assert.ok(login.indexOf("<SiteHeader") < login.indexOf("<main"));
});

test("one page serves sign-in and sign-up, with a switch either way", () => {
  assert.equal(loginCopy.signIn.submitLabel, "Sign in");
  assert.equal(loginCopy.signUp.submitLabel, "Create account");
  assert.match(loginCopy.signIn.switchPrompt, /account/i);
  assert.equal(loginCopy.signIn.switchLabel, loginCopy.signUp.submitLabel);
  assert.equal(loginCopy.signUp.switchLabel, loginCopy.signIn.submitLabel);
});

test("fields are email and password only", () => {
  assert.deepEqual([...loginCopy.fields], [
    { name: "email", label: "Email", type: "email", autoComplete: "email" },
    { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
  ]);
});

test("signup is open: no invite list, waitlist, or approval gate", () => {
  const text = visibleText(loginCopy);
  for (const forbidden of [/invite/i, /waitlist/i, /request access/i, /approv/i]) {
    assert.doesNotMatch(text, forbidden);
  }
});

test("login does not advertise stretch providers or dropped surfaces", () => {
  const text = visibleText(loginCopy);
  for (const forbidden of ["Google", "GitHub", "Clerk", "3D map", "magic link", "SSO"]) {
    assert.equal(text.includes(forbidden), false, `should not mention ${forbidden}`);
  }
});

test("login says why an account exists without re-pitching the Landing hero", () => {
  assert.match(loginCopy.subtitle, /capacity-pressure screen|thread/i);
  assert.notEqual(loginCopy.subtitle, landingCopy.hero.subtitle);
});

test("a carried question is shown so the visitor knows it survived login", () => {
  assert.match(loginCopy.carriedPromptLabel, /question/i);
});
