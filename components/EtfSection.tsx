import type { EtfData } from "@/lib/dashboard";
import { fmtDay, fmtRange, fmtSigned, fmtTime, fmtUsd } from "@/lib/format";
import { BarChart } from "./BarChart";

function Flow({ v, compact, seeded }: { v: number | null; compact?: boolean; seeded?: boolean }) {
  if (v === null) return <span className="text-muted">–</span>;
  const cls = v > 0 ? "text-good" : v < 0 ? "text-bad" : "text-ink-2";
  const digits = compact ? 1 : undefined;
  return (
    <span className={`${cls} tabular-nums ${seeded ? "italic opacity-80" : ""}`} title={seeded ? "Seeded from Farside (secondary source); issuer data starts later" : undefined}>
      {v === 0 ? "0.0" : `${v > 0 ? "+" : "−"}${(Math.abs(v) / 1e6).toFixed(digits ?? 1)}`}
    </span>
  );
}

export function EtfSection({ etf }: { etf: EtfData }) {
  const { tickers, table, windows, funds, chart, updatedAt, latestDay } = etf;
  const latest = table.rows.find((r) => r.date === latestDay);
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">US spot Ethereum ETF flows</h2>
          <p className="text-sm text-ink-2">
            Net creations and redemptions in USD, from each issuer&apos;s own daily NAV, share count and holdings.
            {latest ? ` Latest complete day ${fmtDay(latest.date, { year: true })} (${latest.reporting} of ${tickers.length} funds); most issuers publish a day's count with the next NAV.` : ""}
          </p>
        </div>
        <span className="text-xs text-muted">Collected {fmtTime(updatedAt)}</span>
      </header>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {windows.map((w) => (
          <div key={w.key} className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted">{w.label}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${w.usd > 0 ? "text-good" : w.usd < 0 ? "text-bad" : "text-ink"}`}>{fmtSigned(w.usd)}</div>
            <div className="text-xs text-muted">{fmtRange(w.start, w.end)} · {w.days} trading day{w.days === 1 ? "" : "s"}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2 text-left font-medium">Date</th>
              {tickers.map((t) => (
                <th key={t} className="px-2 py-2 text-right font-medium" title={`${funds[t]?.name ?? t} (${funds[t]?.issuer ?? ""})`}>{t}</th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.date} className="border-t border-grid">
                <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">{fmtDay(r.date, { year: true })}</td>
                {tickers.map((t) => (
                  <td key={t} className="px-2 py-1.5 text-right"><Flow v={r.byFund[t]} compact seeded={r.seeded[t]} /></td>
                ))}
                <td className="px-3 py-1.5 text-right font-semibold" title={r.reporting < tickers.length ? `${r.reporting} of ${tickers.length} funds reported` : undefined}>
                  <Flow v={r.total} compact />{r.reporting < tickers.length && <span className="text-muted">*</span>}
                </td>
              </tr>
            ))}
            {table.rows.length === 0 && (
              <tr><td colSpan={tickers.length + 2} className="px-3 py-6 text-center text-muted">No flows yet. Flows appear once two consecutive daily snapshots exist per fund.</td></tr>
            )}
          </tbody>
        </table>
        <div className="border-t border-grid px-3 py-2 text-xs text-muted">
          USD millions. * Total excludes funds without data for that day. <em>Italic</em> = seeded from Farside for days before the issuer feed starts. Latest holdings:{" "}
          {tickers.map((t) => {
            const s = funds[t]?.latest;
            const err = funds[t]?.lastError;
            return (
              <span key={t} className="mr-3 inline-block" title={err ? `Last collection failed: ${err}` : undefined}>
                <span className="font-medium text-ink-2">{t}</span>{" "}
                {s ? `${fmtUsd(s.aum ?? (s.nav && s.shares ? s.nav * s.shares : undefined))} (${fmtDay(s.date)})` : "no data"}
                {err ? <span className="text-bad"> !</span> : null}
              </span>
            );
          })}
        </div>
      </div>

      <BarChart title="Daily net flow, all funds" points={chart} />
    </section>
  );
}
