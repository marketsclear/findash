import { ChartsSection } from "@/components/ChartsSection";
import { EtfSection } from "@/components/EtfSection";
import { ExchangeCard } from "@/components/ExchangeCard";
import { RatioCard } from "@/components/RatioCard";
import { RefreshButton } from "@/components/RefreshButton";
import { getDashboardData } from "@/lib/dashboard";
import { fmtDay, fmtShare, fmtTime, fmtUsd } from "@/lib/format";

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
              LIT ${data.valuation.lit.price.toFixed(2)} · HYPE ${data.valuation.hype.price.toFixed(2)} · CoinGecko, {fmtTime(data.valuation.hype.updatedAt)}
            </dd>
          </dl>
        ) : (
          <span className="text-sm text-muted">Token prices unavailable (CoinGecko lookup failed)</span>
        )}
      </section>

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
          Volume: Hyperliquid perps (incl. HIP-3 builder markets) from the Hyperliquid candle API, spot from DefiLlama; Lighter perps, spot and the Robinhood
          deployment from the Lighter candle API. Live 24h is the exchanges&apos; own rolling figure. Volume is single-sided notional (it matches
          Hyperliquid&apos;s own 24h figure); Hyperliquid&apos;s stats site counts both sides of each trade and therefore shows about twice these numbers.
        </p>
        <p>
          Revenue: DefiLlama protocol revenue. Hyperliquid = fee share routed to the Assistance Fund (excludes builder and HIP-3 deployer fees). Lighter =
          maker/taker/transfer/withdraw fees kept by the protocol (excludes liquidation fees paid to the LLP).
        </p>
        <p>
          Valuations: CoinGecko. FDV uses each token&apos;s total supply (HYPE ~955M of a 1B max, LIT 1B); circulating market cap uses circulating supply.
        </p>
        <p>
          ETF flows: change in shares outstanding × NAV per issuer-reported day (VanEck: change in ether held × implied price). Sources: iShares fund
          download, Grayscale product-performance workbooks, 21Shares API, Invesco product API, Bitwise and Franklin fund pages, VanEck holdings dataset,
          Fidelity institutional quote. History since launch for ETHA, ETHB, ETHE, ETH and TETH; the others accumulate from the first collection.
        </p>
        <p>Deltas compare each window with the preceding window of equal length; YTD compares with the same dates last year. Amounts in USD.</p>
      </footer>
    </main>
  );
}
