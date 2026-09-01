import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  type LoginEmailField,
  type LoginFieldView,
  type LoginPasswordField,
  loginFieldsToRender,
} from "./login-fields.ts";

function emailField(fields: LoginFieldView[]): LoginEmailField {
  const field = fields.find((item): item is LoginEmailField => item.name === "email");
  assert.ok(field);
  assert.equal("defaultValue" in field, false);
  return field;
}

function passwordField(fields: LoginFieldView[]): LoginPasswordField {
  const field = fields.find((item): item is LoginPasswordField => item.name === "password");
  assert.ok(field);
  assert.equal("value" in field, false);
  return field;
}

test("a refused sign-in restores the typed email as a controlled value, not a new defaultValue", () => {
  const fields = loginFieldsToRender(
    "signIn",
    {
      email: "analyst@example.com",
      errors: { email: "Email or password is incorrect." },
    },
    "analyst@example.com",
  );
  const email = emailField(fields);
  const password = passwordField(fields);

  assert.equal(email.value, "analyst@example.com");
  assert.equal(email.error, "Email or password is incorrect.");
  assert.equal(password.defaultValue, "");
});

test("a refused create-account keeps the email controlled and shows the matching field error", () => {
  const fields = loginFieldsToRender(
    "signUp",
    {
      email: "not-an-email",
      errors: {
        email: "Enter an email address like analyst@example.com.",
        password: "Use at least 8 characters.",
      },
    },
    "not-an-email",
  );
  const email = emailField(fields);
  const password = passwordField(fields);

  assert.equal(email.value, "not-an-email");
  assert.match(String(email.error), /email/i);
  assert.equal(password.defaultValue, "");
  assert.match(String(password.error), /8/);
  assert.equal(password.autoComplete, "new-password");
});

test("switching to create account does not invent a password or wipe a typed email", () => {
  const fields = loginFieldsToRender("signUp", { email: "", errors: {} }, "still@here.com");
  const email = emailField(fields);
  const password = passwordField(fields);

  assert.equal(email.value, "still@here.com");
  assert.equal(password.defaultValue, "");
});

test("Login binds email as a controlled value and password as an empty default", () => {
  // There is no DOM harness here: the warning fires when FieldControl's
  // defaultValue changes after init. Email must be `value`, password a constant
  // empty default so a refused attempt cannot echo the secret or retarget the default.
  const login = readFileSync(new URL("../components/Login.tsx", import.meta.url), "utf8");

  assert.match(login, /loginFieldsToRender\(mode, state, email\)/);
  assert.match(login, /const \[email, setEmail\] = useState\(""\)/);
  assert.match(login, /"value" in field/);
  assert.match(login, /value=\{field\.value\}/);
  assert.match(login, /setEmail\(event\.target\.value\)/);
  assert.match(login, /defaultValue=\{field\.defaultValue\}/);
  assert.doesNotMatch(login, /defaultValue: field\.name === "email"/);
});
