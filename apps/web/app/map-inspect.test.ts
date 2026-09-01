import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  emptyInspect,
  inspectIata,
  reduceInspect,
  type InspectState,
} from "./map-inspect.ts";

const web = new URL("../", import.meta.url);

function source(file: string): string {
  return readFileSync(new URL(file, web), "utf8");
}

function shown(state: InspectState, intent: Parameters<typeof reduceInspect>[1]): string | null {
  return inspectIata(reduceInspect(state, intent));
}

test("hover, keyboard focus, and a tap all name the same column to inspect", () => {
  assert.equal(shown(emptyInspect, { kind: "hover", iata: "BOS" }), "BOS");
  assert.equal(shown(emptyInspect, { kind: "focus", iata: "BOS" }), "BOS");
  assert.equal(shown(emptyInspect, { kind: "tap", iata: "BOS" }), "BOS");
});

test("a tap pins; a second tap on that column, or a tap on empty ground, dismisses", () => {
  const pinned = reduceInspect(emptyInspect, { kind: "tap", iata: "BOS" });
  assert.equal(inspectIata(pinned), "BOS");
  assert.equal(inspectIata(reduceInspect(pinned, { kind: "tap", iata: "BOS" })), null);
  assert.equal(inspectIata(reduceInspect(pinned, { kind: "tap", iata: null })), null);
});

test("desktop hover still reads a column while another is pinned, and leaving it keeps the pin", () => {
  const pinned = reduceInspect(emptyInspect, { kind: "tap", iata: "BOS" });
  const overLax = reduceInspect(pinned, { kind: "hover", iata: "LAX" });
  assert.equal(inspectIata(overLax), "LAX");
  assert.equal(inspectIata(reduceInspect(overLax, { kind: "hover", iata: null })), "BOS");
});

test("the inspect UI is one tooltip, not a native title, a sidecar table, or a dossier", () => {
  const canvas = source("components/SkylineCanvas.tsx");
  const skyline = source("components/Skyline.tsx");
  const inspect = source("components/MapInspect.tsx");

  assert.match(canvas, /MapInspect/);
  assert.match(inspect, /LampPill/);
  assert.match(inspect, /scoreVector/);
  assert.doesNotMatch(inspect, /\btitle=/);
  assert.doesNotMatch(canvas, /\btitle=/);
  assert.doesNotMatch(skyline, /from "@\/components\/answers\/Ranking"/);
  assert.doesNotMatch(skyline, /slotLimit|longHaulShare|describeMethodology/);
});
