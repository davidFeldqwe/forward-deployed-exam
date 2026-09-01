"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { mapCopy } from "@/app/map-copy";
import {
  emptyInspect,
  inspectIata,
  inspectTooltip,
  reduceInspect,
  type InspectIntent,
} from "@/app/map-inspect";
import type { PlacedIataLabel } from "@/app/map-labels";
import type { MapMark } from "@/app/map-view";
import { mountSkyline } from "@/app/skyline-scene";
import { GROUND_OUTLINES } from "@/app/us-ground";
import { MapInspect } from "@/components/MapInspect";

/**
 * The WebGL half of `/map` (issue #69). It owns handing the marks to
 * `mountSkyline`, showing the empty state when the browser gives no context,
 * and the inspect UI that is not the canvas: one tooltip and the close-zoom
 * IATA labels, both read off `scoreUniverse` via the view-model.
 */
export function SkylineCanvas({ marks }: { marks: readonly MapMark[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [webgl, setWebgl] = useState<"unknown" | "missing">("unknown");
  const [inspect, setInspect] = useState(emptyInspect);
  const [labels, setLabels] = useState<readonly PlacedIataLabel[]>([]);

  const byIata = useMemo(
    () => new Map(marks.map((mark) => [mark.iata, mark])),
    [marks],
  );

  const onPointer = useCallback((intent: InspectIntent) => {
    setInspect((state) => reduceInspect(state, intent));
  }, []);

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }
    const teardown = mountSkyline(element, {
      marks,
      outlines: GROUND_OUTLINES,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      onPointer,
      onLabels: setLabels,
    });
    if (!teardown) {
      setWebgl("missing");
      return;
    }
    return teardown;
  }, [marks, onPointer]);

  const shown = inspectIata(inspect);
  const mark = shown === null ? undefined : byIata.get(shown);
  const tooltip = mark === undefined ? null : inspectTooltip(mark);

  if (webgl === "missing") {
    return <NoWebgl />;
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={host}
        role="img"
        aria-label={mapCopy.canvasLabel}
        className="absolute inset-0"
      />
      {tooltip ? <MapInspect tooltip={tooltip} /> : null}
      {labels.map((label) => (
        <IataLabel key={label.iata} label={label} onIntent={onPointer} />
      ))}
    </div>
  );
}

function IataLabel({
  label,
  onIntent,
}: {
  label: PlacedIataLabel;
  onIntent: (intent: InspectIntent) => void;
}) {
  return (
    <button
      type="button"
      className="absolute z-10 -translate-x-1/2 -translate-y-full rounded-sm bg-background/80 px-1 py-0.5 font-mono text-[10px] tracking-wide text-foreground/90 backdrop-blur-[2px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      style={{ left: label.x, top: label.y, opacity: label.fade }}
      onMouseEnter={() => onIntent({ kind: "hover", iata: label.iata })}
      onMouseLeave={() => onIntent({ kind: "hover", iata: null })}
      onFocus={() => onIntent({ kind: "focus", iata: label.iata })}
      onBlur={() => onIntent({ kind: "focus", iata: null })}
      onClick={() => onIntent({ kind: "tap", iata: label.iata })}
    >
      {label.iata}
    </button>
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
