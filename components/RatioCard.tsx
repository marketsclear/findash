import type { RatioData, RatioStat } from "@/lib/dashboard";
import { fmtPp, fmtRange, fmtShare } from "@/lib/format";
import type { Window } from "@/lib/metrics";

function Cell({ stat, prevLabel }: { stat: RatioStat; prevLabel: string }) {
  return (
    <td className="px-3 py-2.5 text-right align-top">
      <div className="text-ink text-[15px] font-semibold tabular-nums">{fmtShare(stat.pct)}</div>
      <div className="mt-0.5 flex justify-end gap-2 text-xs">
        {stat.partial && <span className="text-muted" title="One of the two series does not cover the full window">partial</span>}
        {stat.deltaPp === null ? (
          <span className="text-muted">–</span>
        ) : (
          <span className="font-medium text-ink-2" title={`${prevLabel}: ${fmtShare(stat.prevPct)}`}>
            <span aria-hidden="true">{stat.deltaPp >= 0 ? "▲" : "▼"}</span> {fmtPp(stat.deltaPp)}
          </span>
        )}
      </div>
    </td>
  );
}

export function RatioCard({ ratio, windows }: { ratio: RatioData; windows: Window[] }) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">Lighter as % of Hyperliquid</h2>
        <span className="text-xs text-muted">change in percentage points</span>
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2 text-left font-medium">Window</th>
            <th className="px-3 py-2 text-right font-medium">Volume</th>
            <th className="px-3 py-2 text-right font-medium">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {windows.map((w) => (
            <tr key={w.key} className="border-t border-grid">
              <th scope="row" className="px-4 py-2.5 text-left align-top font-normal">
                <div className="font-medium text-ink">{w.label}</div>
                <div className="text-xs text-muted">{fmtRange(w.start, w.end)}</div>
              </th>
              <Cell stat={ratio.volume.windows[w.key]} prevLabel={w.prevLabel} />
              <Cell stat={ratio.revenue.windows[w.key]} prevLabel={w.prevLabel} />
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
