"use client";

import { useMemo, useState } from "react";
import { LineChart, type ChartSeries } from "./LineChart";
import { addDays } from "@/lib/days";
import { fmtShare } from "@/lib/format";

export interface ChartExchange {
  id: string;
  name: string;
  color: string;
  volume: { day: string; value: number }[];
  revenue: { day: string; value: number }[];
}

const RANGES = [
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "1y", label: "Last year", days: 365 },
  { key: "all", label: "All", days: Infinity },
] as const;

export interface ChartRatio {
  volume: { day: string; value: number }[];
  revenue: { day: string; value: number }[];
}

export function ChartsSection({ exchanges, ratio, asOf }: { exchanges: ChartExchange[]; ratio: ChartRatio; asOf: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("90d");

  const { days, volume, revenue, share } = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!;
    const from = Number.isFinite(r.days) ? addDays(asOf, -(r.days - 1)) : "0000-00-00";
    const set = new Set<string>();
    const toMap = (pts: { day: string; value: number }[]) => {
      const m: Record<string, number> = {};
      for (const p of pts) if (p.day >= from) { m[p.day] = p.value; set.add(p.day); }
      return m;
    };
    const volume: ChartSeries[] = exchanges.map((e) => ({ id: e.id, name: e.name, color: e.color, values: toMap(e.volume) }));
    const revenue: ChartSeries[] = exchanges.map((e) => ({ id: e.id, name: e.name, color: e.color, values: toMap(e.revenue) }));
    const share: ChartSeries[] = [
      { id: "volume", name: "Volume", color: "var(--series-2)", values: toMap(ratio.volume) },
      { id: "revenue", name: "Revenue", color: "var(--series-1)", values: toMap(ratio.revenue) },
    ];
    return { days: [...set].sort(), volume, revenue, share };
  }, [exchanges, ratio, asOf, range]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Date range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={range === r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-md border px-3 py-1 text-sm ${range === r.key ? "border-ink bg-ink text-page" : "border-border bg-surface text-ink-2 hover:bg-wash"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <LineChart title="Daily volume" days={days} series={volume} />
      <LineChart title="Daily revenue" days={days} series={revenue} />
      <LineChart title="Lighter as % of Hyperliquid" days={days} series={share} format={(v) => fmtShare(v, Number.isInteger(v) ? 0 : 1)} />
    </div>
  );
}
