import { lampMarker } from "@/app/lamp-hue";
import type { MapMarker, ResolvedMapView } from "@/app/resolved-map";
import { LampLegend } from "@/components/answers/LampLegend";

/**
 * The resolved airport set, placed (issue #29). Inline SVG of the rows the
 * ranking table just drew, cropped to their own bounding box: no tiles, no map
 * library, and nothing fetched — the points are the snapshot's coordinates,
 * which came back on the same `queryAirports` payload as the table.
 *
 * Every marker keeps its IATA code beside it and takes its hue from its row's
 * candidate lamp, and the table's own legend sits under the drawing, so hue is
 * never the only thing a marker says. Where a marker and a row seem to
 * disagree, the row is the answer: the map is a picture of it.
 */
export function ResolvedMap({ map }: { map: ResolvedMapView }) {
  return (
    <section className="flex flex-col gap-3 overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-baseline gap-2.5 px-4 pt-3.5">
        <span className="text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          Resolved set, placed
        </span>
        <span className="text-[13px] text-body">{map.place}</span>
      </div>
      <div className="px-4">
        <svg
          viewBox={map.viewBox}
          className="h-auto w-full rounded-md border border-grid bg-raised"
          role="img"
          aria-label={`The ${map.markers.length} placed airports of this ranking: ${map.markers
            .map((marker) => marker.iata)
            .join(", ")}. Positions come from the snapshot's coordinates; the ranking table carries the numbers.`}
        >
          {map.markers.map((marker) => (
            <Marker key={marker.iata} marker={marker} />
          ))}
        </svg>
      </div>
      <LampLegend />
      <p className="m-0 border-t border-grid px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
        {map.caption}
      </p>
    </section>
  );
}

/** One airport: its lamp as a dot, its code as the word beside the dot. */
function Marker({ marker }: { marker: MapMarker }) {
  return (
    <g>
      <circle
        cx={marker.x}
        cy={marker.y}
        r={4.5}
        strokeWidth={1.25}
        className={lampMarker(marker.lamp)}
      />
      <text
        x={marker.x + 7}
        y={marker.y + 3.5}
        className="fill-muted-foreground font-mono text-[9px]"
      >
        {marker.iata}
      </text>
      <title>{`${marker.iata} · ${marker.name} · ${marker.lamp}`}</title>
    </g>
  );
}
