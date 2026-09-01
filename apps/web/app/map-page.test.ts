import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

/**
 * `/map` is the public surface (issue #69 / #68): it opens with no session, no
 * LLM key and no aviation HTTP. The claim is checked by walking the route's own
 * static import graph rather than by reading the page alone, because a module
 * three imports down would be just as fatal to it.
 */
const web = new URL("../", import.meta.url);
const ENTRY = "app/map/page.tsx";

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

// `import ... from "x"`, `export ... from "x"`, and `import("x")`.
const moduleEdge = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;

function importsOf(file: string): string[] {
  return [...source(file).matchAll(moduleEdge)].map(([, specifier]) => specifier);
}

/** A specifier that is a file in this app, as a path from the app root. */
function localPath(specifier: string, importer: string): string | null {
  if (specifier.startsWith("@/")) {
    return specifier.slice(2);
  }
  if (!specifier.startsWith(".")) {
    return null;
  }
  const directory = importer.slice(0, importer.lastIndexOf("/"));
  return new URL(specifier, `file:///${directory}/`).pathname.slice(1);
}

/** Whether that path is a file this app holds: a specifier may omit `.ts`. */
function isFile(path: string): boolean {
  return statSync(new URL(path, web), { throwIfNoEntry: false })?.isFile() ?? false;
}

/** Every file in this app the route reaches, the entry included. */
function reachableFrom(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importsOf(file)) {
      const local = localPath(specifier, file);
      if (local === null || local.endsWith(".json")) continue;
      const resolved = [local, `${local}.ts`, `${local}.tsx`].find(isFile);
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen];
}

const graph = reachableFrom(ENTRY);

test("the walk reaches the modules the map is made of", () => {
  const made = [
    ENTRY,
    "components/Skyline.tsx",
    "components/SkylineCanvas.tsx",
    "app/skyline-scene.ts",
    "app/map-view.ts",
    "app/map-insets.ts",
  ];

  for (const file of made) {
    assert.ok(graph.includes(file), file);
  }
});

test("nothing the map loads needs an LLM key", () => {
  const vendor = (specifier: string) =>
    specifier === "ai" || specifier.startsWith("ai/") || specifier.startsWith("@ai-sdk/");

  for (const file of graph) {
    assert.equal(importsOf(file).some(vendor), false, file);
    assert.doesNotMatch(source(file), /ANTHROPIC_API_KEY|OPENAI_API_KEY/, file);
  }
});

test("nothing the map loads goes to the network for a number", () => {
  for (const file of graph) {
    // The screen is a committed snapshot: a live FAA or BTS request at page
    // load is what this route exists to not do.
    assert.doesNotMatch(source(file), /\bfetch\s*\(/, file);
    assert.doesNotMatch(source(file), /mapbox|maptiler|tile\.openstreetmap/i, file);
  }
});

test("the route is public: it reads a session but never sends anyone to login", () => {
  const page = source(ENTRY);

  assert.match(page, /currentSession\(\)/);
  assert.doesNotMatch(page, /redirect\(|loginRedirect/);
  // The bar still offers Sign out to someone who arrived signed in.
  assert.match(page, /signedIn=\{session !== null\}/);
});

test("the columns are the scoring module's rows, not a second screen", () => {
  const page = source(ENTRY);

  assert.match(page, /scoreUniverse\(loadSnapshot\(\)\)/);
  assert.match(page, /mapMarks\(/);
  // Chat's limits are not the map's data path, and are not raised for it.
  assert.doesNotMatch(page, /queryAirports|MAX_LIMIT|DEFAULT_LIMIT/);
});

test("the map has one renderer: no SVG twin to disagree with the canvas", () => {
  // The header's wordmark glyph is an SVG and stays one; what may not exist is
  // a second drawing of the country.
  const drawn = ["components/Skyline.tsx", "components/SkylineCanvas.tsx", "app/skyline-scene.ts"];
  for (const file of drawn) {
    assert.doesNotMatch(source(file), /<svg\b/i, file);
  }
  // One place asks for a WebGL context, and the empty state is what it returns.
  const canvases = graph.filter((file) => /WebGLRenderer|getContext/.test(source(file)));
  assert.deepEqual(canvases, ["app/skyline-scene.ts"]);
});
