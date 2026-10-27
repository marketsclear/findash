import { ChartsSection } from "@/components/ChartsSection";
import { EtfSection } from "@/components/EtfSection";
import { ExchangeCard } from "@/components/ExchangeCard";
import { RatioCard } from "@/components/RatioCard";
import { ValuationMetrics } from "@/components/ValuationMetrics";
import { RefreshButton } from "@/components/RefreshButton";
import { getDashboardData } from "@/lib/dashboard";
import { fmtCompact, fmtDay, fmtPct, fmtRange, fmtShare, fmtTime, fmtUsd } from "@/lib/format";

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
            <dt>Supply</dt>
            <dd className="tabular-nums">
              LIT {fmtCompact(data.valuation.lit.totalSupply)} total ({fmtCompact(data.valuation.lit.burned)} burned), ~{fmtCompact(data.valuation.lit.circulatingSupply, 0)} circulating (estimate) · HYPE{" "}
              {fmtCompact(data.valuation.hype.totalSupply)} total, {fmtCompact(data.valuation.hype.circulatingSupply)} circulating, {fmtCompact(data.valuation.hype.heldByProtocol)} held by the
              Assistance Fund
            </dd>
            <dt>Prices</dt>
            <dd className="tabular-nums">
              LIT ${data.valuation.lit.price.toFixed(2)} ({data.valuation.lit.priceSource}) · HYPE ${data.valuation.hype.price.toFixed(2)} ({data.valuation.hype.priceSource}) ·{" "}
              {fmtTime(data.valuation.hype.updatedAt)} · supply as of {fmtTime(data.valuation.lit.supplyAsOf)}
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
              {fmtCompact(data.valuation.lit.totalSupply)} LIT
            </dd>
            <dt>Circulating basis</dt>
            <dd className="tabular-nums">
              <span className="font-semibold text-ink">${data.fairValue.marketCap.price.toFixed(2)}</span> ({fmtPct(data.fairValue.marketCap.upsidePct)}) · HYPE mcap{" "}
              {fmtUsd(data.valuation.hype.marketCap)} × {fmtShare(data.fairValue.revenuePct)} ÷ {fmtCompact(data.valuation.lit.circulatingSupply, 0)} LIT (est.)
            </dd>
          </dl>
        </section>
      )}

      {data.valuationMetrics && (
        <div className="mb-4">
          <ValuationMetrics data={data.valuationMetrics} />
        </div>
      )}

      <div className="mb-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {data.exchanges.map((ex) => (
          <ExchangeCard key={ex.id} ex={ex} windows={data.windows} color={COLORS[ex.id]} />
        ))}
        <RatioCard ratio={data.ratio} windows={data.windows} />
      </div>

      <ChartsSection
        asOf={data.asOf}
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
          Revenue: Hyperliquid = USD the Assistance Fund spends buying back HYPE, from the fund&apos;s own fills on Hyperliquid. Its parts are trading fees and
          stablecoin reserve yield: since 26 Aug 2026 the USDC deployers pass about 90% of the cost-adjusted reserve yield on USDC held on Hyperliquid to the fund
          (Aligned Quote Asset framework, AQAv2), roughly monthly, through a protocol address
          {data.hlYieldPayments.length
            ? `; ${data.hlYieldPayments.length === 1 ? "first" : "latest"} payment ${fmtUsd(data.hlYieldPayments[data.hlYieldPayments.length - 1].amount)} on ${fmtDay(data.hlYieldPayments[data.hlYieldPayments.length - 1].day, { year: true })}`
            : ""}
          . Each payment is attributed to the days the fund spends it, in proportion to that day&apos;s buybacks, so the parts always sum to the total. HYPE burned
          in deployment auctions and as HyperEVM fees is not included (about 0.4% of revenue over the last 30 days, 1.8% over the last year)
          {data.hlRevenueSeededThrough
            ? `; up to ${fmtDay(data.hlRevenueSeededThrough, { year: true })} from a one-time copy of the buyback series on Hyperliquid's stats site, which matches the fund's fills to the dollar`
            : ""}
          . Lighter = maker, taker, transfer and withdrawal fees, from Lighter&apos;s metrics API (liquidation fees go to the LLP insurance fund and are excluded),
          shown as the main exchange and the Robinhood deployment. Lighter reports the Robinhood fees in full, as here, but splits them 50/50 with Robinhood and has
          not used them for LIT buybacks so far. Lighter&apos;s USDC reserve-yield agreement with Circle (Feb 2026) is not included: it is not routed to the protocol
          (monthly buybacks equal main-exchange fees within 1%) and its amount is undisclosed. Window totals, the Lighter share and the LIT fair value all use the
          totals.
        </p>
        <p>
          Valuations: prices from the exchanges (HYPE mid on Hyperliquid spot, LIT last trade on Lighter&apos;s LIT/USDC market). LIT total supply is read from
          the Ethereum contract minus the LIT Lighter has burned (burns are transfers to the dead address, so the contract&apos;s own total stays at 1B). Lighter
          publishes no circulating figure; the estimate is the 250M distributed at launch, minus burned and treasury-held LIT, plus staking rewards paid from the
          ecosystem reserve (3.72M through June 2026 per Lighter, then a fixed 6% APR on the staked balance). HYPE total and circulating supply are Hyperliquid&apos;s
          own figures: total = max minus burned; circulating excludes future emissions and named non-circulating wallets, including the Assistance Fund&apos;s
          buybacks, which stay inside total supply (strict max-minus-burned definition for both tokens). FDV uses total supply, market cap circulating supply. LIT
          fair value applies HYPE&apos;s valuation-to-revenue multiple to Lighter&apos;s revenue over the monthly window (last 30 complete UTC days): HYPE
          valuation × Lighter revenue / Hyperliquid revenue, divided by LIT supply. It assumes equal multiples and ignores differences in growth, token
          unlocks and how each protocol returns revenue to holders.
        </p>
        <p>
          ETF flows: change in shares outstanding × NAV per issuer-reported day (VanEck: change in ether held × implied price). Sources: iShares fund
          download, Grayscale product-performance workbooks, 21Shares API, Invesco product API, Bitwise and Franklin fund pages, VanEck holdings dataset,
          Fidelity institutional quote, Morgan Stanley product JSON. History since launch for ETHA, ETHB, ETHE, ETH and TETH; the others accumulate from the first collection.
        </p>
        <p>
          Valuation metrics: P/E = valuation ÷ revenue, on fully diluted and circulating bases, with revenue either the trailing 30 days annualized (× 365/30) or
          the trailing 12 months. Revenue is protocol revenue as defined above (totals, including parts); token incentives are not deducted, so this is closer to
          a price-to-sales ratio than to an equity P/E. Earnings yield is its inverse. Buyback yield uses actual purchases: the Assistance Fund&apos;s HYPE buys
          (all of Hyperliquid&apos;s revenue) and Lighter&apos;s treasury LIT buys valued at each day&apos;s price. Take rate = revenue ÷ volume in basis points.
          A dash means the window is not fully covered by data.
        </p>
        <p>
          Deltas compare each window with the preceding window of equal length; YTD compares with the same dates last year. Amounts in USD. The chart window
          control shows the same windows over time: Weekly, Monthly and Yearly plot the total of the 7, 30 or 365 days ending on each day (only where the whole
          window has data), YTD the total since 1 January, so the last point of a chart equals the card figure.
        </p>
      </footer>
    </main>
  );
}
