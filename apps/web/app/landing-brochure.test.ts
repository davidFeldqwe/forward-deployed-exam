import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { landingCopy } from "./landing-copy.ts";
import { siteHeaderCopy } from "./site-header.ts";
import { stackMarks } from "./stack-marks.ts";

const web = new URL("../", import.meta.url);
const landing = readFileSync(new URL("components/Landing.tsx", web), "utf8");

const MOTION = /animate-|fade-in|slide-in/;
const NESTED_OVERFLOW = /overflow-(?:x-|y-)?(?:auto|scroll)/;

/** Inclusive slice of Landing.tsx from `from` up to (not including) `until`. */
function section(from: string, until: string): string {
  const start = landing.indexOf(from);
  const end = landing.indexOf(until);
  assert.ok(start >= 0, from);
  assert.ok(end > start, until);
  assert.equal(start, landing.lastIndexOf(from), `duplicate marker: ${from}`);
  return landing.slice(start, end);
}

function assertStill(source: string): void {
  assert.doesNotMatch(source, MOTION);
}

test("Start asking is the large primary hero action, and the only one", () => {
  const hero = section('aria-labelledby="hero-title"', 'aria-label="Fixture comparison"');

  // One control, still the gated chat path. The header's Sign in stays ghost
  // and icon-sized; this is the brochure's next step.
  assert.match(hero, /size="lg"/);
  assert.doesNotMatch(hero, /size="sm"/);
  assert.equal([...hero.matchAll(/<Button\b/g)].length, 1);
  assert.doesNotMatch(hero, /variant=/);
  assert.match(hero, /href=\{action\.href\}/);
  assert.deepEqual(landingCopy.hero.actions, [{ label: "Start asking", href: "/chat" }]);
  // A visit hits this once; it does not enter or leave.
  assertStill(hero);
});

test("How it works tiles share size and wrap in the landing column; arrows sit between them", () => {
  const strip = section('aria-labelledby="how-heading"', 'aria-label="Privacy"');

  // The page is the only scroller (issue #91). Equal flex allotment, not
  // content-sized boxes; extra steps wrap instead of scrolling the row.
  assert.doesNotMatch(strip, NESTED_OVERFLOW);
  assert.match(strip, /flex-wrap/);
  assert.doesNotMatch(strip, /flex-nowrap/);
  assert.match(strip, /items-stretch/);
  assert.match(strip, /flex-1 basis-0/);
  assert.match(strip, /min-w-\[/);
  assert.match(strip, /min-h-\[/);
  assert.match(strip, /h-full w-full/);
  assert.equal(landingCopy.howItWorks.steps.length, 5);

  // Arrows are their own list items, so they cannot steal width from earlier
  // tiles and make those labels wrap more than the last step.
  assert.match(strip, /<li aria-hidden="true"/);
  assert.ok(strip.indexOf("<li aria-hidden") < strip.indexOf("ArrowRightIcon"));
  assertStill(strip);
});

test("Built on shows each product's real mark, not a text-only badge", () => {
  assert.deepEqual([...landingCopy.builtOn], [
    "Next.js",
    "Convex",
    "Vercel AI SDK",
    "Anthropic",
  ]);

  const paths = landingCopy.builtOn.map((name) => {
    const mark = stackMarks[name];
    assert.ok(mark, name);
    assert.match(mark.viewBox, /^\d/);
    assert.ok(mark.path.length > 0, `${name} mark`);
    return mark.path;
  });
  assert.equal(new Set(paths).size, paths.length);

  // Convex's three-blade logomark (dashboard-icons convex.svg), not a chevron.
  assert.match(stackMarks.Convex.path, /M108\.092 130\.021/);
  assert.doesNotMatch(stackMarks.Convex.path, /M4\.2 5\.1A3\.1/);
  // Anthropic's A-mark (simple-icons), filled as currentColor like the rest.
  assert.match(stackMarks.Anthropic.path, /M17\.3041 3\.541h-3\.6718l6\.696 16\.918H24Z/);

  const strip = section('aria-label="Built on"', 'aria-labelledby="questions-heading"');
  assert.match(strip, /stackMarks\[item\]/);
  assert.match(strip, /<svg\b/);
  assert.match(strip, /fill="currentColor"/);
  assert.doesNotMatch(strip, /<Badge\b/);
  assert.doesNotMatch(strip, /variant="outline"/);
  assertStill(strip);
});

test("the footer GitHub credit wears the same chrome as the header action", () => {
  const footer = landing.slice(landing.indexOf("<footer"));

  assert.match(footer, /GitBranchIcon/);
  assert.match(footer, /<Button\b/);
  assert.match(footer, /variant="ghost"/);
  assert.match(footer, /href=\{footer\.githubHref\}/);
  assert.match(footer, /target="_blank"/);
  assert.match(footer, /rel="noreferrer"/);
  assert.equal(landingCopy.footer.githubHref, siteHeaderCopy.githubHref);
  assert.equal(
    landingCopy.footer.githubHref,
    "https://github.com/davidFeldqwe/forward-deployed-exam",
  );

  // Privacy stays the band above this credit, not a line inside it.
  assert.ok(landing.indexOf('aria-label="Privacy"') < landing.indexOf("<footer"));
  assertStill(footer);
});
