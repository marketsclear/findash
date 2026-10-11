import type { ExchangeData, MetricBlock } from "@/lib/dashboard";
import type { Window } from "@/lib/metrics";
import { fmtPct, fmtRange, fmtUsd } from "@/lib/format";
import type { WindowStat } from "@/lib/metrics";

function Delta({ stat, prevLabel }: { stat: WindowStat; prevLabel: string }) {
  if (stat.deltaPct === null) return <span className="text-muted text-xs">–</span>;
  const up = stat.deltaPct >= 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-good" : "text-bad"}`} title={`${prevLabel}: ${fmtUsd(stat.prev)}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span> {fmtPct(stat.deltaPct)}
    </span>
  );
}

function Cell({ stat, prevLabel }: { stat: WindowStat; prevLabel: string }) {
  return (
    <td className="px-3 py-2.5 text-right align-top">
      <div className="text-ink text-[15px] font-semibold tabular-nums">{fmtUsd(stat.value)}</div>
      <div className="mt-0.5 flex justify-end gap-2">
        {stat.partial && stat.from && stat.through && (
          <span className="text-muted text-xs" title="Data does not cover the full window">{fmtRange(stat.from, stat.through)}</span>
        )}
        <Delta stat={stat} prevLabel={prevLabel} />
      </div>
    </td>
  );
}

/** The parts of each total, per window, with each part's share of its total. Totals stay in the table above. */
function Parts({ ex, windows }: { ex: ExchangeData; windows: Window[] }) {
  const groups: { label: string; block: MetricBlock }[] = [
    { label: "Volume", block: ex.volume },
    { label: "Revenue", block: ex.revenue },
  ].filter((g) => g.block.parts.length > 1);
  if (groups.length === 0) return null;
  const cols = groups.flatMap((g) => g.block.parts.map((p) => ({ key: `${g.label}:${p.name}`, group: g.label, name: p.name, windows: p.windows, total: g.block.windows })));
  return (
    <div className="border-t border-grid">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted">
              <th className="px-4 py-2 text-left font-medium uppercase tracking-wide">Parts</th>
              {cols.map((c) => (
                <th key={c.key} className="px-2 py-2 text-right font-medium">
                  <span className="block text-[10px] uppercase tracking-wide text-muted">{c.group}</span>
                  <span className="text-ink-2">{c.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {windows.map((w) => (
              <tr key={w.key} className="border-t border-grid">
                <th scope="row" className="whitespace-nowrap px-4 py-1.5 text-left font-normal text-ink-2">{w.label}</th>
                {cols.map((c) => {
                  const s = c.windows[w.key];
                  const t = c.total[w.key].value;
                  const share = s.value !== null && t ? (s.value / t) * 100 : null;
                  return (
                    <td key={c.key} className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      <span className="text-ink">{fmtUsd(s.value)}</span>
                      {share !== null && <span className="ml-1 text-muted">{share.toFixed(0)}%</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ExchangeCard({ ex, windows, color }: { ex: ExchangeData; windows: Window[]; color: string }) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} aria-hidden="true" />
          {ex.name}
        </h2>
        <div className="text-sm text-ink-2" title={ex.live24h.parts.map((p) => `${p.name} ${fmtUsd(p.value)}`).join(" · ")}>
          Live 24h volume <span className="font-semibold text-ink">{fmtUsd(ex.live24h.volume)}</span>
        </div>
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
              <Cell stat={ex.volume.windows[w.key]} prevLabel={w.prevLabel} />
              <Cell stat={ex.revenue.windows[w.key]} prevLabel={w.prevLabel} />
            </tr>
          ))}
        </tbody>
      </table>
      <Parts ex={ex} windows={windows} />
    </section>
  );
}
