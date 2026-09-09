<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# findash

Personal financial dashboard for a single user. See README.md for the data sources and layout.

## Commands

```
pnpm dev            # Turbopack dev server
pnpm typecheck      # tsc --noEmit - run before finishing changes that touch types
pnpm lint
pnpm collect        # refresh the data cache (data/*.json); first run is a long backfill
```

## Rules of the road

- Upstream APIs are rate limited and fragile. Hyperliquid: ~1200 weight/min, candleSnapshot costs ~20 + 1 per 60 candles; Lighter's CDN serves an HTML bot challenge (403/405) to concurrent clients. Keep the `RateLimiter` budgets in `lib/sources/*` and never raise concurrency without re-testing a full backfill.
- Collectors are incremental and idempotent: they re-fetch the last three UTC days and overwrite those days only. A backfill only happens when the store is empty. Do not delete `data/` casually - a rebuild takes 30+ minutes.
- All dates are UTC calendar days (`lib/days.ts`). Windows end on the last complete UTC day; today's partial day is never counted except in the "Live 24h" figure.
- Volume totals are the sum of named segments (perps / HIP-3 / spot / Robinhood) so breakdowns stay available. Keep segments when adding a source.
- Charts are hand-rolled SVG following the dataviz conventions: 2px lines, 10% area wash, legend for ≥2 series, crosshair tooltip listing every series, a data table under each chart. Series colors are the `--series-N` tokens in `app/globals.css`; text never wears a series color.
- Storage is `lib/store.ts`: Postgres (`findash_store` key/jsonb table) when `DATABASE_URL` is set, JSON files under `data/` otherwise. Production refreshes come from `.github/workflows/collect.yml`; the web server only refreshes in-process locally (`FINDASH_REFRESH` unset).
- ETF adapters live in `lib/sources/etf/`, one file per issuer, sharing the `FundAdapter` interface. Each returns issuer snapshots (date, shares, nav, eth, aum); flows are derived in `lib/etf-flows.ts`. Verified against Farside: ETHA/ETHE/ETH need `sharesLag: 1`, TETH `sharesLag: 0`. Check `scripts/etf-probe.ts <TICKER>` after touching an adapter.
- Default currency USD (upstream data is USD). No auth yet - the app is meant to run locally.
