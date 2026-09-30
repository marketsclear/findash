# findash

Personal financial dashboard. First module: a perp-DEX monitor showing daily, weekly, monthly,
year-to-date and yearly **volume** and **revenue** for Hyperliquid and Lighter, from the exchanges' own data, with period-over-period
deltas, live 24h volume and daily charts.

## Run

```
pnpm install
pnpm collect      # first run backfills ~2 years of history (30+ min, rate limited by the exchanges)
pnpm dev          # http://localhost:3000
```

The page also refreshes data on its own when the cache is older than an hour (set
`FINDASH_AUTO_REFRESH=0` to disable), and has a "Refresh data" button. An incremental refresh
re-fetches the last three days for every market and takes several minutes because of API rate limits.

Data is cached as JSON files in `data/` (gitignored, regenerable). Override the location with
`FINDASH_DATA_DIR`.

## US spot Ethereum ETF flows

Daily net creations/redemptions per fund, in the style of Farside's table but computed from each
issuer's own published data (no third-party flow feeds). Flow = change in shares outstanding × NAV,
attributed to the order date (issuers that publish counts with a one-day settlement lag are shifted
back one trading day; VanEck publishes no share count, so its flow is the change in ether held × implied
price). Windows sum the total over calendar periods ending on the latest reported day.

| Fund | Issuer | Source | History |
|---|---|---|---|
| ETHA, ETHB | BlackRock | iShares fund-download workbook (Historical sheet) + latest-holdings.csv | since launch |
| ETHE, ETH | Grayscale | product-performance workbook on S3 (the ETF pages themselves block non-browsers) | since launch |
| TETH (ex CETH) | 21Shares | `api.primary.21shares.com` product details + valuation history | since launch |
| QETH | Invesco | `dng-api.invesco.com` prices endpoint, fetched with a Chrome TLS fingerprint (Akamai rejects plain clients) | from first collection |
| ETHW | Bitwise | fund page (server-rendered) | from first collection |
| ETHV | VanEck | holdings dataset JSON behind the fund page (needs the cookie-consent cookie) | from first collection |
| EZET | Franklin Templeton | fund page rendered in headless Chromium | from first collection |
| MSSE | Morgan Stanley | product-page JSON (pricing + trade-date holdings), fetched with a Chrome TLS fingerprint; listed 28 Jul 2026, not on Farside | from first collection |
| FETH | Fidelity | institutional research quote API (page → CSRF token → quote), fetched with a Chrome TLS fingerprint; flow from ether held, since the published share count lags by days | from first collection |

Fidelity and Invesco sit behind Akamai bot management, which scores the TLS handshake; `scripts/impersonate_fetch.py`
(Python, `curl_cffi`) performs those requests with a Chrome fingerprint and a shared cookie jar. Franklin's page is
read with headless Chromium (Playwright).

For the five funds without issuer history (FETH, ETHW, ETHV, QETH, EZET) the days before the first
issuer-derived flow are seeded once from Farside's all-data table (secondary source, captured
2026-09-09). Seeded cells are italic in the UI and flagged `seeded` in the flow data; issuer data takes
precedence as soon as it exists. To refresh the seed: with `pnpm dev` running, open
`farside.co.uk/ethereum-etf-flow-all-data/` in a browser, extract the table and navigate the tab to
`/api/seed/farside?part=N&d=<json>` in chunks (the site's CSP blocks fetch), then run
`pnpm tsx scripts/etf-seed-farside.ts` (and again with `DATABASE_URL` for production).

Collection runs from `.github/workflows/etf.yml` five times around each trading day (23:15 UTC on
the day, then 01:00, 06:00, 11:00 and 19:00 UTC), matching when the issuers publish; or locally with
`pnpm collect:etf`. Verified 8-9 Sep 2026: iShares and Grayscale post the next day's count around
22:30 UTC, Franklin ~00:20, Invesco ~04:00, Morgan Stanley ~05:30, VanEck ~10:15, Bitwise later in
the US day. Third-party tables (Farside) have the same numbers by ~07:00 UTC from vendor settlement
feeds, so the dashboard trails them by up to a day for the latest row. A failing issuer keeps its previous rows and shows a
"!" marker in the section footer. The share-count lag for issuers without history is an assumption
until verified against an independent table (`lagUnverified` in the adapters).

## Deploying (Vercel + Neon + GitHub Actions)

The web app is stateless; history lives in Postgres and is refreshed by a scheduled GitHub Actions job,
because one refresh takes ~8 minutes (exchange rate limits) - far longer than a serverless function.

1. **Neon**: create a database and copy its connection string.
2. **Seed it from the local cache** so the first deploy has history: `DATABASE_URL=... pnpm store:push`.
3. **GitHub**: add `DATABASE_URL` as a repository secret. `.github/workflows/collect.yml` then runs
   `pnpm collect` every 2 hours (and on demand from the Actions tab).
4. **Vercel**: import the repo and set the environment variables
   `DATABASE_URL`, `FINDASH_REFRESH=external`, and optionally `DASHBOARD_PASSWORD`.

Environment variables are listed in `.env.example`. With `DASHBOARD_PASSWORD` set, every page and API
route redirects to `/login` until the password has been entered once (90-day cookie).

## Data sources

Everything in the perp-DEX section comes from the exchanges themselves, except LIT's token supply
(Lighter publishes none).

| Metric | Hyperliquid | Lighter |
|---|---|---|
| Volume | `api.hyperliquid.xyz/info` `candleSnapshot` for every perp (main + HIP-3 dexes) and spot market, base volume × OHLC/4 per candle; hourly candles for recent days, daily candles for older history. All spot pairs are quoted in USD stablecoins. | `exchangeMetrics?kind=volume` per deployment (main exchange + Robinhood deployment at `api.rh.lighter.xyz`); spot = `filter=byMarket` volume of the spot order books, perps = the rest. Full daily history in one request each. |
| Revenue | USD the Assistance Fund (`0xfefe…fefe`) spends buying HYPE, per UTC day, from its fills (`userFillsByTime`). History before the first collection: one-time seed of the "HyperCore Buybacks" series on Hyperliquid's stats site, which matches the fills to the cent. | `exchangeMetrics` maker + taker + transfer + withdrawal fees on both deployments (fees the protocol keeps; liquidation fees go to the LLP and are stored separately). |
| Token price | Hyperliquid spot (`tokenDetails` mid) | Lighter LIT/USDC last trade |
| Token supply | Hyperliquid `tokenDetails` (total / circulating, live) | CoinGecko (1B total, 250M unlocked as of Sep 2026) |
| Live 24h volume | `metaAndAssetCtxs` `dayNtlVlm` summed (perps, HIP-3 dexes, spot) | `exchangeStats.daily_usd_volume` (both deployments) |

Volume is single-sided notional, the convention of Hyperliquid's stats site.

**Verification (30 Sep 2026).** Hyperliquid perps + HIP-3 volume matched Hyperliquid's official stats
series (hyperscreener.asxn.xyz, the backend behind stats.hyperliquid.xyz) within 0.3% for every
dashboard window and every month since mid-2025. Lighter's exchange metrics are Lighter's own
series; the earlier per-market candle sweep ran 0.1-0.2% below them. DefiLlama was dropped as a source:
its Hyperliquid indexer loses data on some days (on 11 Sep 2026 it showed 40% of the day's volume and
revenue), which understated Hyperliquid revenue by ~14% for the latest week. Hyperliquid's own
official daily files on `d2v1fiwobg9w6.cloudfront.net` stopped updating on 3 Apr 2026.

**Operational limit.** Hyperliquid serves only a user's recent fills (about two weeks for the
Assistance Fund), so the collector must run at least weekly or revenue days go missing; the
collector logs a warning when its window no longer reaches back far enough.

Lighter is also shown as a percentage of Hyperliquid: per window for volume and revenue (with the
change in percentage points), as a daily share chart, and as a headline figure for LIT FDV / HYPE FDV
(with the circulating-market-cap ratio alongside).

## Windows

All windows end on the last complete UTC day. Daily = that day; Weekly = last 7 days; Monthly = last
30 days; YTD = 1 Jan through that day; Yearly = last 365 days. Deltas compare with the preceding
window of equal length (YTD: same dates last year) and are only shown when both windows are fully
covered by data.

## Layout

```
lib/sources/     one collector per upstream (hyperliquid volume, hyperliquid-revenue, lighter, valuation, etf/)
lib/collect.ts   runs all collectors, one refresh at a time (shared via globalThis)
lib/store.ts     JSON file cache under data/
lib/metrics.ts   window definitions and sums
lib/dashboard.ts assembles what the page renders
app/page.tsx     dashboard (server component)  ·  app/api/metrics, app/api/refresh
components/      ExchangeCard, ChartsSection, LineChart (inline SVG, no chart library), RefreshButton
scripts/         collect.ts CLI
```
