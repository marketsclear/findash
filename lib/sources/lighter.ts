import { addDays, Day, dayFromMs, todayUtc } from "../days";
import { fetchJson, mapPool, RateLimiter } from "../http";

/**
 * Lighter volume from the public candle API (resolution=1d; `V` is USD notional).
 * Same method DefiLlama's adapter uses. Two deployments: the main zkLighter
 * exchange and the Robinhood-branded deployment (api.rh.lighter.xyz).
 */
const DEPLOYMENTS = [
  { id: "main", api: "https://mainnet.zklighter.elliot.ai/api/v1" },
  { id: "robinhood", api: "https://api.rh.lighter.xyz/api/v1" },
] as const;
const PAGE = 500; // server caps count_back at 500
const CONCURRENCY = 1;
// The CDN in front of Lighter serves a bot challenge to fast clients; stay well under it.
const limiter = new RateLimiter(120, 60_000);

export type LighterSegment = "perps" | "spot" | "robinhood";
export type LighterDay = Record<LighterSegment, number>;
export interface LighterStore {
  updatedAt: string;
  markets: number;
  days: Record<Day, LighterDay>;
}

interface OrderBook { market_id: number; market_type: "perp" | "spot"; symbol: string }
interface Candle { t: number; V: number }

async function markets(api: string): Promise<OrderBook[]> {
  const res = await fetchJson<{ order_books: OrderBook[] }>(`${api}/orderBooks`);
  return res.order_books;
}

async function candlesBack(api: string, marketId: number, endSec: number, countBack: number): Promise<Candle[]> {
  const params = new URLSearchParams({
    market_id: String(marketId),
    resolution: "1d",
    start_timestamp: String(endSec - countBack * 86_400),
    end_timestamp: String(endSec),
    count_back: String(countBack),
  });
  await limiter.take();
  const res = await fetchJson<{ c?: Candle[] }>(`${api}/candles?${params}`);
  return res.c ?? [];
}

/** Full history for one market, paging backwards until the API returns a short page. */
async function candlesAll(api: string, marketId: number): Promise<Candle[]> {
  const out: Candle[] = [];
  let end = Math.floor(Date.now() / 1000);
  for (let page = 0; page < 20; page++) {
    const cs = await candlesBack(api, marketId, end, PAGE);
    if (cs.length === 0) break;
    out.push(...cs);
    if (cs.length < PAGE) break;
    end = Math.floor(Math.min(...cs.map((c) => c.t)) / 1000) - 1;
  }
  return out;
}

export async function collectLighter(existing: LighterStore | null, log: (msg: string) => void): Promise<LighterStore> {
  const today = todayUtc();
  const backfill = !existing || Object.keys(existing.days).length === 0;
  const jobs: { api: string; marketId: number; segment: LighterSegment }[] = [];
  for (const d of DEPLOYMENTS) {
    for (const m of await markets(d.api)) {
      const segment: LighterSegment = d.id === "robinhood" ? "robinhood" : m.market_type === "spot" ? "spot" : "perps";
      jobs.push({ api: d.api, marketId: m.market_id, segment });
    }
  }
  log(`lighter: ${jobs.length} markets, ${backfill ? "full backfill" : "incremental"}`);

  const fresh: Record<Day, LighterDay> = {};
  let done = 0;
  let firstDay: Day = today;
  await mapPool(jobs, CONCURRENCY, async (j) => {
    const cs = backfill
      ? await candlesAll(j.api, j.marketId)
      : await candlesBack(j.api, j.marketId, Math.floor(Date.now() / 1000), 3);
    for (const c of cs) {
      const day = dayFromMs(c.t);
      if (day < firstDay) firstDay = day;
      const row = (fresh[day] ??= { perps: 0, spot: 0, robinhood: 0 });
      row[j.segment] += Number(c.V || 0);
    }
    done++;
    if (done % 100 === 0) log(`lighter: ${done}/${jobs.length}`);
  });

  const overwriteFrom = backfill ? firstDay : addDays(today, -2);
  const days: Record<Day, LighterDay> = {};
  for (const [day, row] of Object.entries(existing?.days ?? {})) if (day < overwriteFrom) days[day] = row;
  Object.assign(days, fresh);
  log(`lighter: done, ${Object.keys(days).length} days`);
  return { updatedAt: new Date().toISOString(), markets: jobs.length, days };
}

/** Rolling 24h USD volume as reported by each deployment's exchangeStats. */
export async function liveLighter24h(): Promise<{ main: number; robinhood: number }> {
  const [main, rh] = await Promise.all(
    DEPLOYMENTS.map((d) => fetchJson<{ daily_usd_volume: number }>(`${d.api}/exchangeStats`)),
  );
  return { main: main.daily_usd_volume, robinhood: rh.daily_usd_volume };
}
