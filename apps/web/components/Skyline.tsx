import { mapCopy } from "@/app/map-copy";
import type { MapMark } from "@/app/map-view";
import { LampPill } from "@/components/LampPill";
import { ComparisonWindow, SiteHeader } from "@/components/SiteHeader";
import { SkylineCanvas } from "@/components/SkylineCanvas";

/**
 * The public `/map` surface (issue #69 / #68): the shared bar, the skyline, and
 * the legend that keeps hue readable in words. No ranking table beside it and
 * no filters — the page is a skyline plus its key.
 */
export function Skyline({
  signedIn,
  marks,
}: {
  signedIn: boolean;
  marks: readonly MapMark[];
}) {
  return (
    // Exactly the viewport: the canvas fills what the bar and the key leave.
    <div className="flex h-svh flex-col bg-background">
      <SiteHeader signedIn={signedIn} current="map" status={<ComparisonWindow />} />

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <SkylineCanvas marks={marks} />
        </div>

        <LampKey />
      </main>
    </div>
  );
}

/**
 * The key: the five lamp words beside the hue and the shape each one draws, and
 * what height means. Hue is allowed on the canvas because this is under it.
 */
function LampKey() {
  return (
    <section
      className="shrink-0 border-t bg-header px-4 py-3 md:px-6"
      aria-labelledby="lamp-key-heading"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <h2
          id="lamp-key-heading"
          className="text-[10px] font-medium tracking-[0.07em] text-muted-foreground uppercase"
        >
          {mapCopy.legendHeading}
        </h2>
        {mapCopy.legend.map((entry) => (
          <span key={entry.lamp} className="flex items-center gap-1.5">
            <LampPill lamp={entry.lamp} />
            <span className="text-[11px] text-muted-foreground">{entry.meaning}</span>
          </span>
        ))}
      </div>
      <p className="mt-2 max-w-[52rem] text-[11.5px] leading-snug text-muted-foreground">
        {mapCopy.encoding}
      </p>
    </section>
  );
}
