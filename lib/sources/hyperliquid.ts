import { addDays, Day, dayFromMs, dayToMs, eachDay, todayUtc } from "../days";
import { fetchJson, mapPool, RateLimiter } from "../http";

/**
 * Hyperliquid volume from Hyperliquid's own candle API (info endpoint), all segments:
 *  - `perps` = main perp universe, `hip3` = builder-deployed HIP-3 dexes (xyz, flx, ...),
 *  - `spot`  = spot order books (all quoted in USD stablecoins, so quote notional = USD).
 *
 * Notional per candle = base volume × OHLC/4. Hourly candles are used for the recent HOURLY_DAYS
 * window and daily candles for older history. Checked on 30 Sep 2026 against Hyperliquid's official
 * stats series: perps + HIP-3 within 0.3% for every dashboard window and every month since mid-2025.
 *
 * Store versions: 1 = perps + HIP-3 only (spot came from DefiLlama); 2 = spot from candles too.
 * A v1 store gets a one-time spot backfill on its next run.
 */
const INFO = "https://api.hyperliquid.xyz/info";
export const HL_BACKFILL_START: Day = "2024-01-01";
const HOURLY_DAYS = 60;
const CONCURRENCY = 2;
// Documented budget is 1200 weight/min per IP; candleSnapshot costs ~20 + 1 per 60 candles returned.
const limiter = new RateLimiter(1100, 60_000);

export type HlSegment = "perps" | "hip3" | "spot";
export type HlDay = Record<HlSegment, number>;
export interface HlStore {
  updatedAt: string;
  version?: 2;
  markets: number;
  days: Record<Day, HlDay>;
}

interface Candle { t: number; o: string; h: string; l: string; c: string; v: string }
interface Meta { universe: { name: string; isDelisted?: boolean }[] }
interface AssetCtx { dayNtlVlm: string; coin?: string }
export interface SpotMeta {
  tokens: { name: string; index: number; tokenId: string }[];
  universe: { name: string; tokens: [number, number]; index: number }[];
}

export async function info<T>(body: Record<string, unknown>): Promise<T> {
  return fetchJson<T>(INFO, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function perpDexNames(): Promise<string[]> {
  const dexs = await info<({ name: string } | null)[]>({ type: "perpDexs" });
  return dexs.filter((d): d is { name: string } => !!d).map((d) => d.name);
}

export interface Market { coin: string; segment: HlSegment; delisted: boolean; active: boolean }

/** Every perp (main + HIP-3) and spot market. `active` = traded in the last 24 hours. */
export async function listMarkets(): Promise<Market[]> {
  const main = await info<Meta>({ type: "meta" });
  const out: Market[] = main.universe.map((u) => ({ coin: u.name, segment: "perps", delisted: !!u.isDelisted, active: !u.isDelisted }));
  for (const dex of await perpDexNames()) {
    const meta = await info<Meta>({ type: "meta", dex });
    out.push(...meta.universe.map((u) => ({ coin: u.name, segment: "hip3" as const, delisted: !!u.isDelisted, active: !u.isDelisted })));
  }
  const [spotMeta, spotCtx] = await info<[SpotMeta, AssetCtx[]]>({ type: "spotMetaAndAssetCtxs" });
  const vol = new Map(spotCtx.map((c, i) => [c.coin ?? spotMeta.universe[i]?.name, Number(c.dayNtlVlm || 0)]));
  out.push(...spotMeta.universe.map((u) => ({ coin: u.name, segment: "spot" as const, delisted: false, active: (vol.get(u.name) ?? 0) > 0 })));
  return out;
}

async function candles(coin: string, interval: "1h" | "1d", startMs: number, endMs: number): Promise<Candle[]> {
  if (endMs <= startMs) return [];
  const expected = (endMs - startMs) / (interval === "1h" ? 3_600_000 : 86_400_000);
  await limiter.take(20 + Math.ceil(expected / 60));
  return info<Candle[]>({ type: "candleSnapshot", req: { coin, interval, startTime: startMs, endTime: endMs } });
}

function notionalByDay(cs: Candle[]): Record<Day, number> {
  const out: Record<Day, number> = {};
  for (const c of cs) {
    const px = (Number(c.o) + Number(c.h) + Number(c.l) + Number(c.c)) / 4;
    const day = dayFromMs(c.t);
    out[day] = (out[day] ?? 0) + Number(c.v) * px;
  }
  return out;
}

export async function collectHyperliquid(existing: HlStore | null, log: (msg: string) => void): Promise<HlStore> {
  const all = await listMarkets();
  const today = todayUtc();
  const now = Date.now();
  const backfill = !existing || Object.keys(existing.days).length === 0;
  const spotBackfill = !backfill && existing?.version !== 2;

  // Which history each segment needs this run: everything on a backfill, the last 3 UTC days
  // otherwise (re-fetched every run so late candles settle), plus all of spot for a v1 store.
  const recentStart = addDays(today, -2);
  const segmentStart: Record<HlSegment, Day> = {
    perps: backfill ? HL_BACKFILL_START : recentStart,
    hip3: backfill ? HL_BACKFILL_START : recentStart,
    spot: backfill || spotBackfill ? HL_BACKFILL_START : recentStart,
  };
  // Incremental runs skip delisted perps and spot pairs with no trades in the last 24 hours.
  const markets = all.filter((m) => (segmentStart[m.segment] === HL_BACKFILL_START ? true : m.active));
  // Hourly candles for the last HOURLY_DAYS on a full backfill, the last 3 days otherwise (the one-time
  // spot backfill uses daily candles for its history: spot is ~2% of volume, so hourly precision is moot).
  const hourlyStart = dayToMs(backfill ? addDays(today, -HOURLY_DAYS) : recentStart);
  log(`hyperliquid: ${markets.length} markets, ${backfill ? "full backfill" : spotBackfill ? "incremental + one-time spot backfill" : "incremental"}`);

  // Zero-initialise every (day, segment) this run is authoritative for, so a market-free day
  // overwrites a stale value instead of keeping it.
  const fresh: Record<Day, Partial<HlDay>> = {};
  for (const seg of Object.keys(segmentStart) as HlSegment[]) {
    for (const day of eachDay(segmentStart[seg], today)) (fresh[day] ??= {})[seg] = 0;
  }

  let done = 0;
  await mapPool(markets, CONCURRENCY, async (m) => {
    const parts: Candle[][] = [];
    if (segmentStart[m.segment] === HL_BACKFILL_START) parts.push(await candles(m.coin, "1d", dayToMs(HL_BACKFILL_START), hourlyStart - 1));
    parts.push(await candles(m.coin, "1h", hourlyStart, now));
    for (const cs of parts) {
      for (const [day, usd] of Object.entries(notionalByDay(cs))) {
        const row = (fresh[day] ??= {});
        row[m.segment] = (row[m.segment] ?? 0) + usd;
      }
    }
    done++;
    if (done % 100 === 0) log(`hyperliquid: ${done}/${markets.length}`);
  });

  // v1 rows have no `spot` key, hence the blank defaults.
  const blank: HlDay = { perps: 0, hip3: 0, spot: 0 };
  const days: Record<Day, HlDay> = {};
  for (const [day, row] of Object.entries(existing?.days ?? {})) days[day] = { ...blank, ...(row as Partial<HlDay>) };
  for (const [day, row] of Object.entries(fresh)) days[day] = { ...blank, ...(days[day] as Partial<HlDay> | undefined), ...row };
  log(`hyperliquid: done, ${Object.keys(days).length} days`);
  return { updatedAt: new Date().toISOString(), version: 2, markets: all.length, days };
}

/** Rolling 24h notional as reported by the exchange itself, by segment. */
export async function liveHyperliquid24h(): Promise<{ perps: number; hip3: number; spot: number }> {
  const sum = (ctxs: AssetCtx[]) => ctxs.reduce((s, c) => s + Number(c.dayNtlVlm || 0), 0);
  const [main, spot, dexs] = await Promise.all([
    info<[Meta, AssetCtx[]]>({ type: "metaAndAssetCtxs" }),
    info<[unknown, AssetCtx[]]>({ type: "spotMetaAndAssetCtxs" }),
    perpDexNames(),
  ]);
  const hip3Parts = await Promise.all(dexs.map((dex) => info<[Meta, AssetCtx[]]>({ type: "metaAndAssetCtxs", dex })));
  return {
    perps: sum(main[1]),
    hip3: hip3Parts.reduce((s, p) => s + sum(p[1]), 0),
    // Spot contexts also list HIP-4 outcome markets ("#<id>", priced as probabilities, no candles);
    // they are not spot pairs and are left out, as in the daily series.
    spot: sum(spot[1].filter((c) => !c.coin?.startsWith("#"))),
  };
}

/** HYPE price and supply as Hyperliquid itself reports them (spot token details). */
export async function hypeTokenDetails(): Promise<{ price: number; totalSupply: number; circulatingSupply: number; maxSupply: number }> {
  const meta = await info<SpotMeta>({ type: "spotMeta" });
  const hype = meta.tokens.find((t) => t.name === "HYPE");
  if (!hype) throw new Error("HYPE not found in spotMeta");
  const d = await info<{ midPx?: string; markPx?: string; totalSupply: string; circulatingSupply: string; maxSupply: string }>({ type: "tokenDetails", tokenId: hype.tokenId });
  return {
    price: Number(d.midPx ?? d.markPx),
    totalSupply: Number(d.totalSupply),
    circulatingSupply: Number(d.circulatingSupply),
    maxSupply: Number(d.maxSupply),
  };
}
