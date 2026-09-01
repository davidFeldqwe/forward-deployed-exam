import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { loginFieldsToRender } from "./login-fields.ts";

test("a refused sign-in restores the typed email as a controlled value, not a new defaultValue", () => {
  const fields = loginFieldsToRender(
    "signIn",
    {
      email: "analyst@example.com",
      errors: { email: "Email or password is incorrect." },
    },
    "analyst@example.com",
  );
  const [email, password] = fields;

  assert.equal(email?.name, "email");
  assert.equal(email && "value" in email ? email.value : undefined, "analyst@example.com");
  assert.equal(email && "defaultValue" in email, false);
  assert.equal(email?.error, "Email or password is incorrect.");

  assert.equal(password?.name, "password");
  assert.equal(
    password && "defaultValue" in password ? password.defaultValue : undefined,
    "",
  );
  assert.equal(password && "value" in password, false);
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
  const [email, password] = fields;

  assert.equal(email && "value" in email ? email.value : undefined, "not-an-email");
  assert.equal(email && "defaultValue" in email, false);
  assert.match(String(email?.error), /email/i);
  assert.equal(password && "defaultValue" in password ? password.defaultValue : undefined, "");
  assert.equal(password && "value" in password, false);
  assert.match(String(password?.error), /8/);
  assert.equal(password?.autoComplete, "new-password");
});

test("switching to create account does not invent a password or wipe a typed email", () => {
  const fields = loginFieldsToRender("signUp", { email: "", errors: {} }, "still@here.com");
  const [email, password] = fields;

  assert.equal(email && "value" in email ? email.value : undefined, "still@here.com");
  assert.equal(password && "defaultValue" in password ? password.defaultValue : undefined, "");
  assert.equal(password && "value" in password, false);
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
