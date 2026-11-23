import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PricePoint, Range } from "../../shared/types";
import { SERIES_COLORS } from "../lib/format";

export interface ChartSeries {
  key: string; // ticker
  name: string;
  color: string;
  points: PricePoint[];
}

type Row = { t: number } & Record<string, number | null>;

/** Merge series onto one timeline, forward-filling each so step lines stay continuous. */
function mergeSeries(series: ChartSeries[]): Row[] {
  const times = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.t)))).sort((a, b) => a - b);
  const idx = series.map(() => 0);
  const last: Array<number | null> = series.map(() => null);
  const rows: Row[] = [];
  for (const t of times) {
    const row: Row = { t } as Row;
    series.forEach((s, i) => {
      while (idx[i] < s.points.length && s.points[idx[i]].t <= t) {
        last[i] = s.points[idx[i]].p;
        idx[i]++;
      }
      row[s.key] = last[i];
    });
    rows.push(row);
  }
  // Extend to "now" so the line reaches the right edge.
  if (rows.length) {
    const now = Date.now();
    const lastRow = rows[rows.length - 1];
    if (now - lastRow.t > 60_000) rows.push({ ...lastRow, t: now });
  }
  return rows;
}

function tickFormatter(range: Range) {
  return (t: number) => {
    const d = new Date(t);
    if (range === "1d") return d.toLocaleTimeString("en-US", { hour: "numeric" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: unknown; value?: unknown }>;
  label?: unknown;
  series: ChartSeries[];
}) {
  if (!active || !payload?.length) return null;
  const byKey = new Map(series.map((s) => [s.key, s]));
  const items = payload
    .filter((p) => typeof p.value === "number")
    .map((p) => ({ s: byKey.get(String(p.dataKey)), v: p.value as number }))
    .filter((x) => x.s)
    .sort((a, b) => b.v - a.v);
  return (
    <div className="min-w-40 rounded-lg border border-line bg-white px-3 py-2 shadow-lift">
      <div className="mb-1 text-[11px] text-muted">
        {new Date(Number(label)).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      </div>
      {items.map(({ s, v }) => (
        <div key={s!.key} className="flex items-center justify-between gap-4 text-[13px]">
          <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: s!.color }} />
            <span className="max-w-36 truncate">{s!.name}</span>
          </span>
          <span className="tnum font-semibold text-ink">{Math.round(v)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function PriceChart({
  series,
  range,
  height = 300,
  compact = false,
}: {
  series: ChartSeries[];
  range: Range;
  height?: number;
  compact?: boolean;
}) {
  const data = useMemo(() => mergeSeries(series), [series]);
  const hasData = data.length > 0;

  return (
    <div style={{ height }} className="w-full">
      {!hasData ? (
        <div className="grid h-full place-items-center text-sm text-muted">No trades yet</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: compact ? 4 : 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#f0f1f4" strokeDasharray="0" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={tickFormatter(range)}
              tick={{ fill: "#9aa0ab", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={48}
              hide={compact}
            />
            <YAxis
              orientation="right"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "#9aa0ab", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ stroke: "#0f1115", strokeOpacity: 0.25, strokeDasharray: "3 3" }}
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload as Array<{ dataKey?: unknown; value?: unknown }> | undefined}
                  label={props.label}
                  series={series}
                />
              )}
              isAnimationActive={false}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.name}
                type="stepAfter"
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function colorFor(i: number): string {
  return SERIES_COLORS[i % SERIES_COLORS.length];
}

export function RangeTabs({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const ranges: Array<[Range, string]> = [
    ["1d", "1D"],
    ["1w", "1W"],
    ["1m", "1M"],
    ["all", "ALL"],
  ];
  return (
    <div className="flex gap-1" role="tablist" aria-label="Chart range">
      {ranges.map(([r, label]) => (
        <button
          key={r}
          role="tab"
          aria-selected={value === r}
          onClick={() => onChange(r)}
          className={
            value === r
              ? "rounded-md bg-ink px-2.5 py-1 text-xs font-semibold text-white"
              : "rounded-md px-2.5 py-1 text-xs font-semibold text-muted hover:bg-surface hover:text-ink"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
