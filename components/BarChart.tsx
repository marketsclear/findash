"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDay, fmtSigned, fmtUsd } from "@/lib/format";

/** Signed daily bars (net flows) with a crosshair tooltip and a table view. Single series. */
export function BarChart({ title, points, height = 240 }: { title: string; points: { day: string; value: number; detail?: string }[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const M = { top: 14, right: 16, bottom: 28, left: 60 };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.max(280, entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = points.length;
  const innerW = width - M.left - M.right;
  const innerH = height - M.top - M.bottom;

  const { yMax, ticks } = useMemo(() => {
    let max = 0;
    for (const p of points) max = Math.max(max, Math.abs(p.value));
    if (max <= 0) return { yMax: 1, ticks: [-1, 0, 1] };
    const pow = 10 ** Math.floor(Math.log10(max / 2));
    const f = max / 2 / pow;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
    const top = Math.ceil(max / step) * step;
    const t: number[] = [];
    for (let v = -top; v <= top + step / 2; v += step) t.push(v);
    return { yMax: top, ticks: t };
  }, [points]);

  const slot = n > 0 ? innerW / n : innerW;
  const barW = Math.max(2, Math.min(24, slot - 2));
  const x = (i: number) => M.left + i * slot + (slot - barW) / 2;
  const y = (v: number) => M.top + innerH / 2 - (v / yMax) * (innerH / 2);

  const xTicks = useMemo(() => {
    const count = Math.max(2, Math.min(7, Math.floor(innerW / 110)));
    const out = new Set<number>();
    for (let k = 0; k < count; k++) out.add(Math.round((k * (n - 1)) / (count - 1)));
    return [...out];
  }, [n, innerW]);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - M.left) / slot);
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const hp = hover !== null ? points[hover] : null;
  const tipLeft = hover !== null && x(hover) > width - 200;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div ref={ref} className="relative">
        {n === 0 ? (
          <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>No data yet</div>
        ) : (
          <svg width={width} height={height} role="img" aria-label={title} tabIndex={0} className="block touch-none select-none outline-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
                <text x={M.left - 8} y={y(t)} dy="0.35em" textAnchor="end" fontSize={11} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {t === 0 ? "$0" : fmtUsd(t)}
                </text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text key={i} x={x(i) + barW / 2} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill="var(--muted)">
                {fmtDay(points[i].day, { year: i === 0 || i === n - 1 })}
              </text>
            ))}
            {points.map((p, i) => {
              const top = Math.min(y(0), y(p.value));
              const h = Math.max(1, Math.abs(y(p.value) - y(0)));
              return (
                <rect key={p.day} x={x(i)} y={top} width={barW} height={h} rx={2} fill={p.value >= 0 ? "var(--series-3)" : "var(--series-4)"} opacity={hover === null || hover === i ? 1 : 0.6} />
              );
            })}
            {hover !== null && <line x1={x(hover) + barW / 2} x2={x(hover) + barW / 2} y1={M.top} y2={M.top + innerH} stroke="var(--axis)" strokeWidth={1} />}
          </svg>
        )}
        {hp && hover !== null && (
          <div className="pointer-events-none absolute top-2 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-sm" style={tipLeft ? { right: width - x(hover) + 12 } : { left: x(hover) + barW + 12 }}>
            <div className="mb-1 text-muted">{fmtDay(hp.day, { year: true })}</div>
            <div className="font-semibold text-ink tabular-nums">{fmtSigned(hp.value)}</div>
            {hp.detail && <div className="mt-1 text-ink-2">{hp.detail}</div>}
          </div>
        )}
      </div>
      {n > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-ink-2">Data table</summary>
          <div className="mt-2 max-h-72 overflow-auto rounded border border-grid">
            <table className="w-full tabular-nums">
              <thead className="sticky top-0 bg-surface text-left text-muted">
                <tr><th className="px-2 py-1 font-medium">Day</th><th className="px-2 py-1 text-right font-medium">Net flow</th></tr>
              </thead>
              <tbody>
                {[...points].reverse().map((p) => (
                  <tr key={p.day} className="border-t border-grid"><td className="px-2 py-1">{p.day}</td><td className="px-2 py-1 text-right">{fmtSigned(p.value)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
