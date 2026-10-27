import { Fragment } from "react";
import type { ValuationMetricRow, ValuationMetricsData } from "@/lib/dashboard";
import { fmtDay, fmtPct, fmtShare, fmtUsd } from "@/lib/format";

function fmt(v: number | null, kind: ValuationMetricRow["kind"]): string {
  if (v === null || !Number.isFinite(v)) return "–";
  switch (kind) {
    case "price":
      return `$${v.toFixed(2)}`;
    case "usd":
      return fmtUsd(v);
    case "multiple":
      return `${v < 10 ? v.toFixed(1) : v.toFixed(0)}x`;
    case "pct":
      return fmtShare(v, 1);
    case "signedPct":
      return fmtPct(v);
    case "bps":
      return `${v.toFixed(2)} bps`;
  }
}

export function ValuationMetrics({ data }: { data: ValuationMetricsData }) {
  const groups = [...new Set(data.rows.map((r) => r.group))];
  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">Valuation metrics</h2>
        <span className="text-xs text-muted">windows end {fmtDay(data.asOf, { year: true })} · revenue totals, parts included · live prices</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2 text-left font-medium">Metric</th>
              <th className="px-3 py-2 text-right font-medium">Hyperliquid</th>
              <th className="px-3 py-2 text-right font-medium">Lighter</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="border-t border-grid">
                  <th colSpan={3} className="px-4 pb-1 pt-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted">
                    {g}
                  </th>
                </tr>
                {data.rows
                  .filter((r) => r.group === g)
                  .map((r) => (
                    <tr key={r.label} className="border-t border-grid">
                      <th scope="row" className="px-4 py-2 text-left font-normal">
                        <div className="text-ink">{r.label}</div>
                        <div className="text-xs text-muted">{r.basis}</div>
                      </th>
                      <td className="whitespace-nowrap px-3 py-2 text-right align-top font-semibold tabular-nums text-ink">{fmt(r.hyperliquid, r.kind)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right align-top font-semibold tabular-nums text-ink">{fmt(r.lighter, r.kind)}</td>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
