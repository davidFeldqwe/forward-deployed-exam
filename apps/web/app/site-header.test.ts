import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CHAT_PATH, LANDING_PATH, LOGIN_PATH, MAP_PATH, postLoginPath } from "./auth-gate.ts";
import { chatCopy } from "./chat-copy.ts";
import { landingCopy } from "./landing-copy.ts";
import { loginCopy } from "./login-copy.ts";
import { siteHeader, siteHeaderCopy, type HeaderLink } from "./site-header.ts";

const web = new URL("../", import.meta.url);
const repo = new URL("../../", web);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

function doc(file: string): string {
  return readFileSync(new URL(file, repo), "utf8");
}

/** Every surface that wears the shared bar, login and `/map` included. */
const SURFACES = [
  "components/Landing.tsx",
  "components/Login.tsx",
  "components/Chat.tsx",
  "components/Skyline.tsx",
];

/** The one header link with this key, whichever surface is asking. */
function link(signedIn: boolean, key: HeaderLink["key"]): HeaderLink {
  const found = siteHeader(signedIn).links.find((action) => action.key === key);
  assert.ok(found, `${key} link`);
  return found;
}

test("the product name is one string, and every surface wears the same header", () => {
  assert.equal(siteHeaderCopy.wordmark, "Airport Investment Intelligence Agent");
  assert.equal(siteHeader(false).wordmark, siteHeaderCopy.wordmark);
  assert.equal(siteHeader(true).wordmark, siteHeaderCopy.wordmark);

  // No surface keeps a second copy of the name to drift from.
  assert.equal("wordmark" in chatCopy, false);
  assert.equal("header" in landingCopy, false);
  assert.equal("wordmark" in loginCopy, false);

  for (const file of SURFACES) {
    assert.match(source(file), /<SiteHeader\b/, file);
  }
});

test("every surface offers the same three actions, in one order", () => {
  for (const signedIn of [false, true]) {
    assert.deepEqual(
      siteHeader(signedIn).links.map((action) => action.key),
      ["chat", "map", "github"],
    );
  }

  // Chat leads and stays inside the product; the map is the public surface
  // beside it.
  const chat = link(false, "chat");
  assert.equal(chat.label, "Chat");
  assert.equal(chat.href, CHAT_PATH);
  assert.equal(chat.external, false);

  const map = link(false, "map");
  assert.equal(map.label, "Map");
  assert.equal(map.href, MAP_PATH);
  assert.equal(map.external, false);
  // The map is a public surface, so the gate does not accept it as somewhere to
  // land after signing in: only chat paths are honoured there.
  assert.equal(postLoginPath(MAP_PATH), CHAT_PATH);
});

test("GitHub opens this repository, and leaves the product to do it", () => {
  const github = link(true, "github");

  assert.equal(github.label, "GitHub");
  assert.equal(github.href, "https://github.com/davidFeldqwe/forward-deployed-exam");
  assert.equal(github.external, true);
  // An external link opens in its own tab, and cannot reach back at the opener.
  assert.match(source("components/SiteHeader.tsx"), /rel="noreferrer"/);
});

test("the identity is a destination to the Landing on every surface", () => {
  const header = source("components/SiteHeader.tsx");

  assert.equal(LANDING_PATH, "/");
  assert.match(header, /<Link href=\{LANDING_PATH\}/);
  // A visitor who opened login from a card, Chat, or the profile control
  // still has this same control; it does not depend on history.
  assert.match(source("components/Login.tsx"), /<SiteHeader\s+signedIn=\{false\}/);
});

test("the profile control reaches login signed out and signs out signed in", () => {
  assert.deepEqual(siteHeader(false).profile, {
    kind: "signIn",
    label: "Sign in",
    href: LOGIN_PATH,
  });
  assert.deepEqual(siteHeader(true).profile, {
    kind: "signOut",
    label: "Sign out",
  });

  assert.equal(siteHeaderCopy.signOutCancelLabel, "Cancel");
  assert.match(siteHeaderCopy.signOutConfirmTitle, /sign out/i);
  assert.match(siteHeaderCopy.signOutConfirmDescription, /session/i);

  // The header icon opens a dialog. Confirming is the server action; Cancel
  // is Dialog.Close, so it cannot POST signOut.
  const signOut = source("components/SignOutControl.tsx");
  assert.match(signOut, /<Dialog\.Root>/);
  assert.match(signOut, /render=\{<Dialog\.Trigger/);
  assert.match(signOut, /<form action=\{signOut\}>/);
  assert.match(signOut, /type="submit"/);
  assert.match(signOut, /<Dialog\.Close/);
  assert.match(signOut, /signOutCancelLabel/);
  assert.doesNotMatch(source("components/SiteHeader.tsx"), /<form action=\{signOut\}>/);

  const closeAt = signOut.indexOf("<Dialog.Close");
  const formAt = signOut.indexOf("<form action={signOut}>");
  assert.ok(closeAt >= 0 && formAt >= 0);
  assert.ok(closeAt < formAt, "Cancel is not the sign-out submit");
});

test("the bar is sticky, full-bleed, and still", () => {
  const header = source("components/SiteHeader.tsx");

  assert.match(header, /sticky top-0/);
  // Full width with the content padded off the edges, not a centred strip.
  assert.doesNotMatch(header, /mx-auto|max-w-\[/);
  assert.match(header, /px-4/);
  // Above the recents drawer and its scrim, which are z-20 and z-10.
  assert.match(header, /z-30/);
  // Chrome that is always there does not enter or leave.
  assert.doesNotMatch(header, /animate-|slide-in|fade-in/);

  // No surface draws a bar of its own beside the shared one.
  for (const file of SURFACES) {
    assert.doesNotMatch(source(file), /<header/, file);
  }
});

test("a phone-width bar gives way at the identity, never at the actions", () => {
  const header = source("components/SiteHeader.tsx");

  // The identity takes the room the actions do not want: a long product name
  // is clipped rather than pushing a control off the end of the bar.
  assert.match(header, /min-w-0 flex-1/);
  assert.match(header, /shrink-0/);
  assert.match(source("components/Wordmark.tsx"), /truncate/);
  // Labels are read but not drawn on a phone, so the glyphs stay hittable.
  assert.match(header, /max-sm:sr-only/);

  // The comparison window is the secondary phrase that shortens to its years.
  assert.match(header, /comparisonWindowYears/);
});

test("focus order is identity, then the header actions, then the page", () => {
  const header = source("components/SiteHeader.tsx");

  // The rail's drawer control leads the bar, where the rail it opens is; the
  // three actions all come after the name.
  assert.ok(header.indexOf("<Wordmark") < header.indexOf("<HeaderAction"));
  assert.ok(header.indexOf("<HeaderAction") < header.indexOf("<Profile"));

  for (const file of SURFACES) {
    const surface = source(file);
    assert.ok(surface.indexOf("<SiteHeader") < surface.indexOf("<main"), file);
  }
});

test("the bar names the comparison window, and shortens it to its years", () => {
  assert.match(siteHeaderCopy.comparisonWindow, /Comparison window/);
  assert.match(siteHeaderCopy.comparisonWindow, /2023/);
  assert.match(siteHeaderCopy.comparisonWindow, /2024/);
  // A phone-width bar drops the phrase, never the years.
  assert.ok(siteHeaderCopy.comparisonWindow.includes(siteHeaderCopy.comparisonWindowYears));
  assert.match(siteHeaderCopy.comparisonWindowYears, /^2023.2024$/);
});

test("chat fills both header slots: the recents control and the window", () => {
  const chat = source("components/Chat.tsx");

  assert.match(chat, /<SiteHeader\s+signedIn\b/);
  assert.match(chat, /<ThreadRailToggle/);
  assert.match(chat, /status=\{<ComparisonWindow/);
});

test("a surface marks its own control current, and nothing else's", () => {
  const onMap = siteHeader(false, "map").links;

  assert.deepEqual(
    onMap.map((action) => action.current),
    [false, true, false],
  );
  // Landing is the brochure: it is not one of the header's own actions, so no
  // control is current there.
  assert.equal(
    siteHeader(false).links.some((action) => action.current),
    false,
  );
  assert.deepEqual(
    siteHeader(true, "chat").links.filter((action) => action.current).map((action) => action.key),
    ["chat"],
  );
});

test("the current control says so to a screen reader, not only in the palette", () => {
  const header = source("components/SiteHeader.tsx");

  assert.match(header, /aria-current=/);
});

test("both surfaces hand the header the one they are", () => {
  assert.match(source("components/Chat.tsx"), /current="chat"/);
  assert.match(source("components/Skyline.tsx"), /current="map"/);
});

test("the PRD and the coding standards describe the shared header", () => {
  const prd = doc("PRD.md");
  const standards = doc(".sandcastle/CODING_STANDARDS.md");

  // GitHub is header chrome on both surfaces now, not a footer link only.
  const story8 = prd.split("\n").find((line) => line.startsWith("8. "));
  assert.ok(story8, "story 8");
  assert.doesNotMatch(story8, /only as a footer link/i);
  assert.match(story8, /header/i);

  const story16 = prd.split("\n").find((line) => line.startsWith("16. "));
  assert.ok(story16, "story 16");
  assert.match(story16, /confirm/i);

  for (const text of [prd, standards]) {
    assert.match(text, /sticky/i);
    assert.match(text, /profile control/i);
    assert.match(text, /login/i);
  }
});
