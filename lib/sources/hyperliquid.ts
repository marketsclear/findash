import { addDays, Day, dayFromMs, dayToMs, todayUtc } from "../days";
import { fetchJson, mapPool, RateLimiter } from "../http";

/**
 * Hyperliquid perps volume, computed from the public candle API.
 *
 * Notional per candle = base volume × OHLC/4. Checked against the exchange's own
 * rolling 24h notional (dayNtlVlm): hourly candles agree to ~0.01%, daily candles
 * to within ~1-3% on volatile days. The collector therefore uses hourly candles
 * for the recent HOURLY_DAYS window and daily candles only for older history.
 *
 * Segments: `perps` = main universe; `hip3` = builder-deployed HIP-3 dexes (xyz, flx, ...).
 * Spot volume is not taken from here (see defillama.ts).
 */
const INFO = "https://api.hyperliquid.xyz/info";
export const HL_BACKFILL_START: Day = "2024-01-01";
const HOURLY_DAYS = 60;
const CONCURRENCY = 2;
// Documented budget is 1200 weight/min per IP; candleSnapshot costs ~20 + 1 per 60 candles returned.
const limiter = new RateLimiter(1100, 60_000);

export type HlSegment = "perps" | "hip3";
export type HlDay = Record<HlSegment, number>;
export interface HlStore {
  updatedAt: string;
  markets: number;
  days: Record<Day, HlDay>;
}

interface Candle { t: number; o: string; h: string; l: string; c: string; v: string }
interface Meta { universe: { name: string; isDelisted?: boolean }[] }
interface AssetCtx { dayNtlVlm: string }

async function info<T>(body: Record<string, unknown>): Promise<T> {
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

export interface Market { coin: string; segment: HlSegment; delisted: boolean }

export async function listMarkets(): Promise<Market[]> {
  const main = await info<Meta>({ type: "meta" });
  const out: Market[] = main.universe.map((u) => ({ coin: u.name, segment: "perps", delisted: !!u.isDelisted }));
  for (const dex of await perpDexNames()) {
    const meta = await info<Meta>({ type: "meta", dex });
    out.push(...meta.universe.map((u) => ({ coin: u.name, segment: "hip3" as const, delisted: !!u.isDelisted })));
  }
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
  // Delisted markets have no new candles; only the backfill needs them.
  const markets = backfill ? all : all.filter((m) => !m.delisted);
  // Re-fetch the last 3 UTC days on every incremental run so late-arriving candles settle.
  const hourlyStart = dayToMs(addDays(today, backfill ? -HOURLY_DAYS : -2));
  log(`hyperliquid: ${markets.length} markets, ${backfill ? "full backfill" : "incremental"}`);

  const fresh: Record<Day, HlDay> = {};
  let done = 0;
  await mapPool(markets, CONCURRENCY, async (m) => {
    const parts: Candle[][] = [];
    if (backfill) parts.push(await candles(m.coin, "1d", dayToMs(HL_BACKFILL_START), hourlyStart - 1));
    parts.push(await candles(m.coin, "1h", hourlyStart, now));
    for (const cs of parts) {
      for (const [day, usd] of Object.entries(notionalByDay(cs))) {
        const row = (fresh[day] ??= { perps: 0, hip3: 0 });
        row[m.segment] += usd;
      }
    }
    done++;
    if (done % 100 === 0) log(`hyperliquid: ${done}/${markets.length}`);
  });

  const overwriteFrom = backfill ? HL_BACKFILL_START : dayFromMs(hourlyStart);
  const days: Record<Day, HlDay> = {};
  for (const [day, row] of Object.entries(existing?.days ?? {})) if (day < overwriteFrom) days[day] = row;
  Object.assign(days, fresh);
  log(`hyperliquid: done, ${Object.keys(days).length} days`);
  return { updatedAt: new Date().toISOString(), markets: all.length, days };
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
    spot: sum(spot[1]),
  };
}
