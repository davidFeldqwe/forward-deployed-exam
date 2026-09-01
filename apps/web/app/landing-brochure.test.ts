import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { landingCopy } from "./landing-copy.ts";
import { stackMarks } from "./stack-marks.ts";

const web = new URL("../", import.meta.url);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

const landing = source("components/Landing.tsx");

/** The hero block, from the labelled section through the demo card. */
function section(labelledBy: string, until: string): string {
  const start = landing.indexOf(labelledBy);
  const end = landing.indexOf(until);
  assert.ok(start >= 0, labelledBy);
  assert.ok(end > start, until);
  return landing.slice(start, end);
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
  assert.doesNotMatch(hero, /animate-|fade-in|slide-in/);
});

test("How it works tiles share width and height; arrows sit between them", () => {
  const strip = section('aria-labelledby="how-heading"', 'aria-label="Privacy"');

  // Equal flex allotment, not content-sized boxes. A shared min width keeps
  // a wrapping label from eating a neighbour, and overflow scrolls the row.
  assert.match(strip, /flex-nowrap/);
  assert.match(strip, /items-stretch/);
  assert.match(strip, /overflow-x-auto/);
  assert.match(strip, /flex-1 basis-0/);
  assert.match(strip, /min-w-\[/);
  assert.match(strip, /min-h-\[/);
  assert.match(strip, /h-full w-full/);

  // Arrows are their own list items, so they cannot steal width from earlier
  // tiles and make those labels wrap more than the last step.
  assert.match(strip, /<li aria-hidden="true"/);
  assert.ok(strip.indexOf("<li aria-hidden") < strip.indexOf("ArrowRightIcon"));
  assert.doesNotMatch(strip, /animate-|fade-in|slide-in/);
});

test("Built on shows each product's real mark, not a text-only badge", () => {
  assert.deepEqual([...landingCopy.builtOn], ["Next.js", "Convex", "Vercel AI SDK"]);

  const paths = landingCopy.builtOn.map((name) => {
    const mark = stackMarks[name];
    assert.ok(mark, name);
    assert.match(mark.viewBox, /^0 0 /);
    assert.ok(mark.path.length > 0, `${name} mark`);
    return mark.path;
  });
  assert.equal(new Set(paths).size, paths.length);

  const strip = section('aria-label="Built on"', 'aria-labelledby="questions-heading"');
  assert.match(strip, /stackMarks\[item\]/);
  assert.match(strip, /<svg\b/);
  assert.doesNotMatch(strip, /<Badge\b/);
  assert.doesNotMatch(strip, /variant="outline"/);
  assert.doesNotMatch(strip, /animate-|fade-in|slide-in/);
});

test("the footer GitHub credit wears the same chrome as the header action", () => {
  const footer = landing.slice(landing.indexOf("<footer"));

  assert.match(footer, /GitBranchIcon/);
  assert.match(footer, /<Button\b/);
  assert.match(footer, /variant="ghost"/);
  assert.match(footer, /href=\{footer\.githubHref\}/);
  assert.match(footer, /target="_blank"/);
  assert.match(footer, /rel="noreferrer"/);
  assert.equal(
    landingCopy.footer.githubHref,
    "https://github.com/davidFeldqwe/forward-deployed-exam",
  );

  // Privacy stays the band above this credit, not a line inside it.
  assert.ok(landing.indexOf('aria-label="Privacy"') < landing.indexOf("<footer"));
  assert.doesNotMatch(footer, /animate-|fade-in|slide-in/);
});
