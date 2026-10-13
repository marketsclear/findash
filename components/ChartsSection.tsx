"use client";

import { useMemo, useState } from "react";
import { LineChart, type ChartSeries } from "./LineChart";
import { addDays, eachDay } from "@/lib/days";
import { fmtShare } from "@/lib/format";

export interface ChartExchange {
  id: string;
  name: string;
  color: string;
  /** Full daily history, oldest first, ending on the last complete UTC day. */
  volume: { day: string; value: number }[];
  revenue: { day: string; value: number }[];
}

const RANGES = [
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "1y", label: "Last year", days: 365 },
  { key: "all", label: "All", days: Infinity },
] as const;

/** Same windows as the cards: the chart shows each window's total ending on each day. */
const MODES = [
  { key: "daily", label: "Daily", days: 1, title: "Daily" },
  { key: "weekly", label: "Weekly", days: 7, title: "7-day total" },
  { key: "monthly", label: "Monthly", days: 30, title: "30-day total" },
  { key: "ytd", label: "YTD", days: 0, title: "year to date" },
  { key: "yearly", label: "Yearly", days: 365, title: "365-day total" },
] as const;
type ModeKey = (typeof MODES)[number]["key"];

/**
 * Window total ending on each day. Trailing windows (7 / 30 / 365 days) are only defined where the
 * whole window has data, so a series never ramps up from zero at its start; year to date sums from
 * 1 Jan, or from the series start in its first year, the same clipping the cards use.
 */
function windowed(points: { day: string; value: number }[], mode: ModeKey): Record<string, number> {
  const out: Record<string, number> = {};
  if (points.length === 0) return out;
  const sorted = [...points].sort((a, b) => a.day.localeCompare(b.day));
  if (mode === "daily") {
    for (const p of sorted) out[p.day] = p.value;
    return out;
  }
  const value = new Map(sorted.map((p) => [p.day, p.value]));
  const first = sorted[0].day;
  const days = eachDay(first, sorted[sorted.length - 1].day);
  const prefix: number[] = [0];
  for (const d of days) prefix.push(prefix[prefix.length - 1] + (value.get(d) ?? 0));
  const len = MODES.find((m) => m.key === mode)!.days;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (!value.has(d)) continue;
    let start: number;
    if (mode === "ytd") {
      const jan1 = `${d.slice(0, 4)}-01-01`;
      start = jan1 <= first ? 0 : days.indexOf(jan1);
    } else {
      start = i - len + 1;
      if (start < 0) continue;
    }
    out[d] = prefix[i + 1] - prefix[start];
  }
  return out;
}

const btn = (active: boolean) =>
  `rounded-md border px-3 py-1 text-sm ${active ? "border-ink bg-ink text-page" : "border-border bg-surface text-ink-2 hover:bg-wash"}`;

export function ChartsSection({ exchanges, asOf }: { exchanges: ChartExchange[]; asOf: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("90d");
  const [mode, setMode] = useState<ModeKey>("daily");
  // One crosshair for the per-exchange revenue panels.
  const [hoverDay, setHoverDay] = useState<string | null>(null);

  const { volume, revenue, share, volDays, revDays, shareDays } = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!;
    const from = Number.isFinite(r.days) ? addDays(asOf, -(r.days - 1)) : "0000-00-00";
    const clip = (m: Record<string, number>) => {
      const out: Record<string, number> = {};
      for (const [d, v] of Object.entries(m)) if (d >= from) out[d] = v;
      return out;
    };
    // Each chart spans only the days its own series cover (revenue history is shorter than volume).
    const daysOf = (...maps: Record<string, number>[]) => [...new Set(maps.flatMap((m) => Object.keys(m)))].sort();
    const vol = exchanges.map((e) => ({ e, values: clip(windowed(e.volume, mode)) }));
    const rev = exchanges.map((e) => ({ e, values: clip(windowed(e.revenue, mode)) }));
    const volume: ChartSeries[] = vol.map(({ e, values }) => ({ id: e.id, name: e.name, color: e.color, values }));
    const revenue: ChartSeries[] = rev.map(({ e, values }) => ({ id: e.id, name: e.name, color: e.color, values }));
    // Lighter as a percentage of Hyperliquid, on the same window totals.
    const pct = (num: Record<string, number> | undefined, den: Record<string, number> | undefined) => {
      const out: Record<string, number> = {};
      for (const [d, v] of Object.entries(num ?? {})) {
        const b = den?.[d];
        if (b !== undefined && b > 0) out[d] = (v / b) * 100;
      }
      return out;
    };
    const hl = (xs: { e: ChartExchange; values: Record<string, number> }[]) => xs.find((x) => x.e.id === "hyperliquid")?.values;
    const li = (xs: { e: ChartExchange; values: Record<string, number> }[]) => xs.find((x) => x.e.id === "lighter")?.values;
    const share: ChartSeries[] = [
      { id: "volume", name: "Volume", color: "var(--series-2)", values: pct(li(vol), hl(vol)) },
      { id: "revenue", name: "Revenue", color: "var(--series-1)", values: pct(li(rev), hl(rev)) },
    ];
    return {
      volume,
      revenue,
      share,
      volDays: daysOf(...volume.map((x) => x.values)),
      revDays: daysOf(...revenue.map((x) => x.values)),
      shareDays: daysOf(...share.map((x) => x.values)),
    };
  }, [exchanges, asOf, range, mode]);

  const m = MODES.find((x) => x.key === mode)!;
  const suffix = mode === "daily" ? "" : ` · ${m.title}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" role="radio" aria-checked={range === r.key} onClick={() => setRange(r.key)} className={btn(range === r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Window">
          <span className="text-xs uppercase tracking-wide text-muted">Window</span>
          {MODES.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={mode === x.key} onClick={() => setMode(x.key)} className={btn(mode === x.key)} title={x.key === "daily" ? "Each day's value" : x.key === "ytd" ? "Total since 1 January, ending on each day" : `Total of the ${x.days} days ending on each day`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <LineChart title={mode === "daily" ? "Daily volume" : `Volume${suffix}`} days={volDays} series={volume} />
      {/* Revenue differs by an order of magnitude between the two, so each exchange gets its own panel
          and axis (never two scales on one plot); the panels share the date range and the crosshair. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {revenue.map((s) => (
          <LineChart
            key={s.id}
            title={mode === "daily" ? `Daily revenue · ${s.name}` : `Revenue · ${s.name}${suffix}`}
            days={revDays}
            series={[s]}
            hoverDay={hoverDay}
            onHoverDay={setHoverDay}
          />
        ))}
      </div>
      <LineChart title={`Lighter as % of Hyperliquid${suffix}`} days={shareDays} series={share} format={(v) => fmtShare(v, Number.isInteger(v) ? 0 : 1)} />
    </div>
  );
}
