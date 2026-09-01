"use client";

import { useEffect, useRef, useState } from "react";

import { mapCopy } from "@/app/map-copy";
import type { MapMark } from "@/app/map-view";
import { mountSkyline } from "@/app/skyline-scene";
import { GROUND_OUTLINES } from "@/app/us-ground";

/**
 * The WebGL half of `/map` (issue #69). It owns exactly two things: handing the
 * marks to `mountSkyline`, and showing the empty state when the browser gives
 * no context to draw on. Every number it draws was decided in `app/map-view.ts`
 * from `scoreUniverse`, and the ground outline is committed geometry it imports
 * itself rather than a payload the server re-sends on every render.
 */
export function SkylineCanvas({ marks }: { marks: readonly MapMark[] }) {
  const host = useRef<HTMLDivElement>(null);
  // Unknown until a context has actually been asked for: the empty state is a
  // failed request, not a guess from a feature list.
  const [webgl, setWebgl] = useState<"unknown" | "missing">("unknown");

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }
    const teardown = mountSkyline(element, {
      marks,
      outlines: GROUND_OUTLINES,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    if (!teardown) {
      setWebgl("missing");
      return;
    }
    return teardown;
  }, [marks]);

  if (webgl === "missing") {
    return <NoWebgl />;
  }

  return (
    <div
      ref={host}
      // The mesh is not readable, so the canvas says what it is and the legend
      // and the encoding note beside it carry the numbers in words.
      role="img"
      aria-label={mapCopy.canvasLabel}
      className="h-full w-full"
    />
  );
}

/**
 * No context: a short line about why, and where the same numbers still are.
 * Deliberately not a second map — two renderers could disagree, and this one
 * invents nothing to fill the space.
 */
function NoWebgl() {
  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-16">
      <div className="max-w-[38rem] text-center">
        <p className="mb-2 text-base font-medium text-foreground">{mapCopy.noWebgl.heading}</p>
        <p className="text-[13px] leading-normal text-muted-foreground">{mapCopy.noWebgl.body}</p>
      </div>
    </div>
  );
}
