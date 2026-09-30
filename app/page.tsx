import { ChartsSection } from "@/components/ChartsSection";
import { EtfSection } from "@/components/EtfSection";
import { ExchangeCard } from "@/components/ExchangeCard";
import { RatioCard } from "@/components/RatioCard";
import { RefreshButton } from "@/components/RefreshButton";
import { getDashboardData } from "@/lib/dashboard";
import { fmtDay, fmtPct, fmtRange, fmtShare, fmtTime, fmtUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

const COLORS: Record<string, string> = { hyperliquid: "var(--series-1)", lighter: "var(--series-2)" };

export default async function Page() {
  const data = await getDashboardData();
  const oldest = data.exchanges.map((e) => e.updatedAt).filter(Boolean).sort()[0] ?? null;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Perp DEX monitor</h1>
          <p className="mt-1 text-sm text-ink-2">
            Hyperliquid and Lighter · volume and revenue · windows end {fmtDay(data.asOf, { year: true })} (last complete UTC day)
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {data.refreshMode === "inprocess" ? (
            <RefreshButton initial={{ running: data.refresh.running, log: data.refresh.log, error: data.refresh.error }} />
          ) : (
            <span className="text-sm text-ink-2">Refreshed on a schedule</span>
          )}
          <span className="text-xs text-muted">Data updated {fmtTime(oldest)}</span>
        </div>
      </header>

      {!data.hasData && (
        <p className="mb-6 rounded-md border border-border bg-surface px-4 py-3 text-sm text-ink-2">
          First load: collecting history from the exchange APIs. This takes a few minutes; the page refreshes itself when done.
        </p>
      )}

      <section className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border border-border bg-surface px-5 py-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">LIT FDV as % of HYPE FDV</div>
          <div className="mt-1 text-5xl font-semibold leading-none text-ink">{data.valuation ? fmtShare(data.valuation.fdvPct) : "–"}</div>
        </div>
        {data.valuation ? (
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-sm text-ink-2">
            <dt>Fully diluted</dt>
            <dd className="tabular-nums">
              LIT {fmtUsd(data.valuation.lit.fdv)} / HYPE {fmtUsd(data.valuation.hype.fdv)}
            </dd>
            <dt>Circulating market cap</dt>
            <dd className="tabular-nums">
              <span className="font-semibold text-ink">{fmtShare(data.valuation.marketCapPct)}</span> · LIT {fmtUsd(data.valuation.lit.marketCap)} / HYPE{" "}
              {fmtUsd(data.valuation.hype.marketCap)}
            </dd>
            <dt>Prices</dt>
            <dd className="tabular-nums">
              LIT ${data.valuation.lit.price.toFixed(2)} ({data.valuation.lit.priceSource}) · HYPE ${data.valuation.hype.price.toFixed(2)} ({data.valuation.hype.priceSource}) ·{" "}
              {fmtTime(data.valuation.hype.updatedAt)}
            </dd>
          </dl>
        ) : (
          <span className="text-sm text-muted">Token prices unavailable (price or supply lookup failed)</span>
        )}
      </section>

      {data.fairValue && data.valuation && (
        <section className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border border-border bg-surface px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">LIT fair value at HYPE&apos;s revenue multiple</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-5xl font-semibold leading-none text-ink">${data.fairValue.fdv.price.toFixed(2)}</span>
              <span className={`text-sm font-medium ${data.fairValue.fdv.upsidePct >= 0 ? "text-good" : "text-bad"}`}>
                <span aria-hidden="true">{data.fairValue.fdv.upsidePct >= 0 ? "▲" : "▼"}</span> {fmtPct(data.fairValue.fdv.upsidePct)} vs ${data.valuation.lit.price.toFixed(2)}
              </span>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-sm text-ink-2">
            <dt>30-day revenue</dt>
            <dd className="tabular-nums">
              <span className="font-semibold text-ink">{fmtShare(data.fairValue.revenuePct)}</span> of Hyperliquid · {fmtUsd(data.fairValue.lighterRevenue)} / {fmtUsd(data.fairValue.hyperliquidRevenue)} ·{" "}
              {fmtRange(data.fairValue.from, data.fairValue.through)}
            </dd>
            <dt>Fully diluted</dt>
            <dd className="tabular-nums">
              HYPE FDV {fmtUsd(data.valuation.hype.fdv)} × {fmtShare(data.fairValue.revenuePct)} = LIT FDV {fmtUsd(data.fairValue.fdv.impliedValuation)} ÷{" "}
              {fmtUsd(data.valuation.lit.totalSupply).replace("$", "")} LIT
            </dd>
            <dt>Circulating basis</dt>
            <dd className="tabular-nums">
              <span className="font-semibold text-ink">${data.fairValue.marketCap.price.toFixed(2)}</span> ({fmtPct(data.fairValue.marketCap.upsidePct)}) · HYPE mcap{" "}
              {fmtUsd(data.valuation.hype.marketCap)} × {fmtShare(data.fairValue.revenuePct)} ÷ {fmtUsd(data.valuation.lit.circulatingSupply).replace("$", "")} LIT
            </dd>
          </dl>
        </section>
      )}

      <div className="mb-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {data.exchanges.map((ex) => (
          <ExchangeCard key={ex.id} ex={ex} windows={data.windows} color={COLORS[ex.id]} />
        ))}
        <RatioCard ratio={data.ratio} windows={data.windows} />
      </div>

      <ChartsSection
        asOf={data.asOf}
        ratio={{ volume: data.ratio.volume.points, revenue: data.ratio.revenue.points }}
        exchanges={data.exchanges.map((e) => ({ id: e.id, name: e.name, color: COLORS[e.id], volume: e.volume.points, revenue: e.revenue.points }))}
      />

      <div className="my-10 border-t border-border" />

      <EtfSection etf={data.etf} />

      <footer className="mt-8 space-y-1 text-xs text-muted">
        <p>
          Volume, from each exchange&apos;s own data: Hyperliquid perps, HIP-3 builder markets and spot from Hyperliquid&apos;s candle API; Lighter from
          Lighter&apos;s exchange-metrics API (daily volume per deployment, including the Robinhood deployment; spot from per-market volume). Live 24h is each
          exchange&apos;s own rolling figure. Volume is single-sided notional, the same convention as Hyperliquid&apos;s stats site.
        </p>
        <p>
          Revenue: Hyperliquid = USD the Assistance Fund spends buying back HYPE, from the fund&apos;s own fills on Hyperliquid (deployment-auction burns,
          about 0.4%, are not included)
          {data.hlRevenueSeededThrough
            ? `; up to ${fmtDay(data.hlRevenueSeededThrough, { year: true })} from a one-time copy of the buyback series on Hyperliquid's stats site, which matches the fund's fills to the dollar`
            : ""}
          . Lighter = maker, taker, transfer and withdrawal fees the protocol keeps, from Lighter&apos;s metrics API (liquidation fees go to the LLP insurance fund
          and are excluded).
        </p>
        <p>
          Valuations: HYPE price and supply from Hyperliquid (total supply about 999M of a 1B max, including HYPE held by the Assistance Fund); LIT price from
          Lighter&apos;s LIT/USDC market; LIT supply from CoinGecko, since Lighter publishes none (1B total, 250M unlocked). FDV uses total supply, market cap
          circulating supply. LIT
          fair value applies HYPE&apos;s valuation-to-revenue multiple to Lighter&apos;s revenue over the monthly window (last 30 complete UTC days): HYPE
          valuation × Lighter revenue / Hyperliquid revenue, divided by LIT supply. It assumes equal multiples and ignores differences in growth, token
          unlocks and how each protocol returns revenue to holders.
        </p>
        <p>
          ETF flows: change in shares outstanding × NAV per issuer-reported day (VanEck: change in ether held × implied price). Sources: iShares fund
          download, Grayscale product-performance workbooks, 21Shares API, Invesco product API, Bitwise and Franklin fund pages, VanEck holdings dataset,
          Fidelity institutional quote, Morgan Stanley product JSON. History since launch for ETHA, ETHB, ETHE, ETH and TETH; the others accumulate from the first collection.
        </p>
        <p>Deltas compare each window with the preceding window of equal length; YTD compares with the same dates last year. Amounts in USD.</p>
      </footer>
    </main>
  );
}
