"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDay, fmtUsd } from "@/lib/format";

export interface ChartSeries {
  id: string;
  name: string;
  /** CSS color (a token var) for the mark. Text never wears it. */
  color: string;
  values: Record<string, number>;
}

const M = { top: 14, right: 84, bottom: 28, left: 60 };

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const s = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return s * pow;
}

export function LineChart({
  title,
  days,
  series,
  height = 260,
  format = fmtUsd,
}: {
  title: string;
  days: string[];
  series: ChartSeries[];
  height?: number;
  /** Formats values, ticks, labels and table cells. */
  format?: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.max(280, entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = days.length;
  const innerW = width - M.left - M.right;
  const innerH = height - M.top - M.bottom;
  const longRange = n > 370;

  const { yTop, ticks } = useMemo(() => {
    let max = 0;
    for (const s of series) for (const d of days) max = Math.max(max, s.values[d] ?? 0);
    if (max <= 0) return { yTop: 1, ticks: [0, 1] };
    const step = niceStep(max / 4);
    const top = Math.ceil(max / step) * step;
    const t: number[] = [];
    for (let v = 0; v <= top + step / 2; v += step) t.push(v);
    return { yTop: top, ticks: t };
  }, [series, days]);

  const x = (i: number) => M.left + (n > 1 ? (i * innerW) / (n - 1) : innerW / 2);
  const y = (v: number) => M.top + innerH - (v / yTop) * innerH;

  const paths = useMemo(() => {
    return series.map((s) => {
      const line: string[] = [];
      const area: string[] = [];
      let run: number[] = [];
      const flush = () => {
        if (run.length === 0) return;
        const pts = run.map((i) => `${x(i).toFixed(1)},${y(s.values[days[i]]).toFixed(1)}`);
        line.push(`M${pts.join("L")}`);
        area.push(`M${x(run[0]).toFixed(1)},${y(0).toFixed(1)}L${pts.join("L")}L${x(run[run.length - 1]).toFixed(1)},${y(0).toFixed(1)}Z`);
        run = [];
      };
      for (let i = 0; i < n; i++) {
        if (s.values[days[i]] === undefined) flush();
        else run.push(i);
      }
      flush();
      let last: number | null = null;
      for (let i = n - 1; i >= 0; i--) if (s.values[days[i]] !== undefined) { last = i; break; }
      return { line: line.join(" "), area: area.join(" "), last };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, days, width, height, yTop]);

  // Direct end-labels only when they don't collide; the legend always carries identity.
  const endLabels = useMemo(() => {
    const ys = paths.map((p, si) => (p.last === null ? null : y(series[si].values[days[p.last]])));
    const defined = ys.filter((v): v is number => v !== null).sort((a, b) => a - b);
    for (let i = 1; i < defined.length; i++) if (defined[i] - defined[i - 1] < 14) return null;
    return ys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, series, days, yTop, height]);

  const xTicks = useMemo(() => {
    const count = Math.max(2, Math.min(7, Math.floor(innerW / 110)));
    const out: number[] = [];
    for (let k = 0; k < count; k++) out.push(Math.round((k * (n - 1)) / (count - 1)));
    return Array.from(new Set(out));
  }, [n, innerW]);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - M.left) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  function onKey(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key === "ArrowLeft") { e.preventDefault(); setHover((h) => Math.max(0, (h ?? n - 1) - 1)); }
    if (e.key === "ArrowRight") { e.preventDefault(); setHover((h) => Math.min(n - 1, (h ?? -1) + 1)); }
    if (e.key === "Escape") setHover(null);
  }

  const hoverDay = hover !== null ? days[hover] : null;
  const tipLeft = hover !== null && x(hover) > width - 200;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <ul className="flex gap-4 text-xs text-ink-2" aria-label="Legend">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </li>
          ))}
        </ul>
      </div>
      <div ref={ref} className="relative">
        {n === 0 ? (
          <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>No data yet</div>
        ) : (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${title}, ${fmtDay(days[0], { year: true })} to ${fmtDay(days[n - 1], { year: true })}`}
            tabIndex={0}
            className="block touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-series-1"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
                <text x={M.left - 8} y={y(t)} dy="0.35em" textAnchor="end" fontSize={11} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {format(t)}
                </text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill="var(--muted)">
                {fmtDay(days[i], { year: longRange || i === 0 || i === n - 1 })}
              </text>
            ))}
            {paths.map((p, si) => (
              <g key={series[si].id}>
                <path d={p.area} fill={series[si].color} fillOpacity={0.1} />
                <path d={p.line} fill="none" stroke={series[si].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {p.last !== null && (
                  <circle cx={x(p.last)} cy={y(series[si].values[days[p.last]])} r={4} fill={series[si].color} stroke="var(--surface)" strokeWidth={2} />
                )}
                {endLabels && endLabels[si] !== null && p.last !== null && (
                  <text x={x(p.last) + 10} y={endLabels[si]!} dy="0.35em" fontSize={11} fontWeight={600} fill="var(--ink-2)">
                    {format(series[si].values[days[p.last]])}
                  </text>
                )}
              </g>
            ))}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + innerH} stroke="var(--axis)" strokeWidth={1} />
                {series.map((s) =>
                  s.values[days[hover]] === undefined ? null : (
                    <circle key={s.id} cx={x(hover)} cy={y(s.values[days[hover]])} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                  ),
                )}
              </g>
            )}
          </svg>
        )}
        {hover !== null && hoverDay && (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-sm"
            style={tipLeft ? { right: width - x(hover) + 12 } : { left: x(hover) + 12 }}
          >
            <div className="mb-1 text-muted">{fmtDay(hoverDay, { year: true })}</div>
            {series.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden="true" />
                <span className="font-semibold text-ink tabular-nums">{s.values[hoverDay] === undefined ? "–" : format(s.values[hoverDay])}</span>
                <span className="text-ink-2">{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {n > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-ink-2">Data table</summary>
          <div className="mt-2 max-h-72 overflow-auto rounded border border-grid">
            <table className="w-full tabular-nums">
              <thead className="sticky top-0 bg-surface text-left text-muted">
                <tr>
                  <th className="px-2 py-1 font-medium">Day</th>
                  {series.map((s) => <th key={s.id} className="px-2 py-1 text-right font-medium">{s.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...days].reverse().map((d) => (
                  <tr key={d} className="border-t border-grid">
                    <td className="px-2 py-1">{d}</td>
                    {series.map((s) => <td key={s.id} className="px-2 py-1 text-right">{s.values[d] === undefined ? "–" : format(s.values[d])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
