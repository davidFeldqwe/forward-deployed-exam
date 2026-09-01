import { lampBar } from "@/app/lamp-hue";
import type { CompositeBar, CompositeChartView } from "@/app/ranking-chart";
import { LampLegend } from "@/components/answers/LampLegend";

/** Drawing box in SVG user units. The card scales it to its own width. */
const CHART_WIDTH = 320;
const LABEL_WIDTH = 32;
const ROW_HEIGHT = 22;
const BAR_X = LABEL_WIDTH + 8;
const BAR_MAX = CHART_WIDTH - BAR_X - 36;
const BAR_Y = 7;
const BAR_HEIGHT = 8;

/**
 * Horizontal composite bars (issue #30). One bar per IATA, composite only,
 * lamp hues matching the table. Partial inputs and No data keep a hollow
 * track and no number — the screen withheld a composite, so the chart does
 * not invent a length.
 */
export function CompositeChart({ chart }: { chart: CompositeChartView }) {
  const height = Math.max(chart.bars.length * ROW_HEIGHT, ROW_HEIGHT);
  const description = chartDescription(chart.bars);

  return (
    <section className="flex flex-col gap-3 overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-baseline gap-2.5 px-4 pt-3.5">
        <span className="text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          Composite score
        </span>
      </div>
      <div className="px-4">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${height}`}
          className="h-auto w-full rounded-md border border-grid bg-raised"
          role="img"
          aria-label={description}
        >
          {chart.bars.map((bar, index) => (
            <Bar key={bar.iata} bar={bar} y={index * ROW_HEIGHT} />
          ))}
        </svg>
      </div>
      <LampLegend />
      <p className="m-0 border-t border-grid px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
        {chart.caption}
      </p>
    </section>
  );
}

function Bar({ bar, y }: { bar: CompositeBar; y: number }) {
  const composite = bar.composite;
  const scored = composite !== null;
  const track = { x: BAR_X, y: BAR_Y, width: BAR_MAX, height: BAR_HEIGHT, rx: 1 };
  const width = scored ? (composite / 100) * BAR_MAX : 0;

  return (
    <g transform={`translate(0, ${y})`}>
      <title>{barTitle(bar)}</title>
      <text
        x={LABEL_WIDTH}
        y={BAR_Y + 7}
        textAnchor="end"
        className="fill-muted-foreground font-mono text-[9px]"
      >
        {bar.iata}
      </text>
      <rect {...track} className="fill-white/8" />
      {scored ? (
        <>
          <rect {...track} width={width} className={lampBar(bar.lamp)} />
          <text
            x={BAR_X + width + 4}
            y={BAR_Y + 7}
            className="fill-foreground font-mono text-[9px]"
          >
            {composite}
          </text>
        </>
      ) : (
        <rect {...track} fill="none" strokeWidth={1} className="stroke-muted-foreground" />
      )}
    </g>
  );
}

function chartDescription(bars: readonly CompositeBar[]): string {
  const scores = bars.map((bar) => {
    if (bar.composite === null) {
      return `${bar.iata} withheld`;
    }
    return `${bar.iata} ${bar.composite}`;
  });
  return (
    `Composite score by IATA for this ranking: ${scores.join(", ")}. ` +
    "Numbers come from the same queryAirports payload as the ranking table."
  );
}

function barTitle(bar: CompositeBar): string {
  if (bar.composite === null) {
    return `${bar.iata} · ${bar.name} · ${bar.lamp}`;
  }
  return `${bar.iata} · ${bar.name} · ${bar.composite} · ${bar.lamp}`;
}
