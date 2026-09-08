# findash

Personal financial dashboard. First module: a perp-DEX monitor showing daily, weekly, monthly,
year-to-date and yearly **volume** and **revenue** for Hyperliquid and Lighter, with period-over-period
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

| Metric | Hyperliquid | Lighter |
|---|---|---|
| Perps volume | `api.hyperliquid.xyz/info` `candleSnapshot`, base volume × OHLC/4 per candle, main universe + HIP-3 dexes. Hourly candles for the last 60 days, daily candles before that. | `mainnet.zklighter.elliot.ai/api/v1/candles` (`resolution=1d`, `V` is USD) for every market, plus the Robinhood deployment at `api.rh.lighter.xyz`. |
| Spot volume | DefiLlama `summary/dexs/hyperliquid` | Included in the candle sweep (spot markets have ids ≥ 2048). |
| Revenue | DefiLlama `summary/fees/hyperliquid?dataType=dailyRevenue` | DefiLlama `summary/fees/lighter?dataType=dailyRevenue` |
| Token valuation | CoinGecko `coins/markets` (HYPE) | CoinGecko `coins/markets` (LIT) |
| Live 24h volume | `metaAndAssetCtxs` `dayNtlVlm` summed (perps, HIP-3 dexes, spot) | `exchangeStats.daily_usd_volume` (both deployments) |

DefiLlama's perps-volume endpoints are behind their paid plan, which is why volume is computed
from the exchanges' own candle APIs. The candle method was checked against Hyperliquid's own
rolling-24h notional: hourly candles agree to ~0.01%, daily candles to within a few percent per
market on volatile days.

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
lib/sources/     one collector per upstream (hyperliquid, lighter, defillama)
lib/collect.ts   runs all collectors, one refresh at a time (shared via globalThis)
lib/store.ts     JSON file cache under data/
lib/metrics.ts   window definitions and sums
lib/dashboard.ts assembles what the page renders
app/page.tsx     dashboard (server component)  ·  app/api/metrics, app/api/refresh
components/      ExchangeCard, ChartsSection, LineChart (inline SVG, no chart library), RefreshButton
scripts/         collect.ts CLI
```
