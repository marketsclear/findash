import { addDays, Day, DAY_MS, dayFromMs, eachDay } from "../days";
import { fetchJson, RateLimiter, sleep } from "../http";

/**
 * Lighter volume and revenue from Lighter's own exchange-metrics API, which serves the full daily
 * history in one request per metric (timestamps are UTC midnights, in seconds):
 *  - volume: `kind=volume` per deployment (main zkLighter exchange and the Robinhood deployment).
 *    Spot is the sum of `filter=byMarket` volume over the main exchange's spot order books; perps is
 *    the rest. Checked on 30 Sep 2026: our earlier per-market candle sums ran 0.1-0.2% below this
 *    series, mostly because delisted markets drop out of the candle sweep.
 *  - revenue: maker + taker + transfer + withdrawal fees on both deployments, i.e. fees the protocol
 *    keeps, also stored per deployment. Liquidation fees go to the LLP insurance fund and are stored
 *    separately, not as revenue. Lighter's own monthly updates report the Robinhood deployment's fees in
 *    full although they are split 50/50 with Robinhood and (as of Oct 2026) not used for LIT buybacks;
 *    the dashboard follows Lighter's reporting and shows the two deployments as parts. Lighter's USDC
 *    reserve-yield agreement with Circle (Feb 2026) is not included: it is not routed to the protocol
 *    (monthly buybacks equal main-exchange fees within 1%) and its amount is undisclosed.
 * Every run rewrites the whole history, so there is no backfill state to manage.
 *
 * The API never serves the day in progress: a day's point appears only after the day has closed.
 * Observed in the collector logs of Oct-Nov 2026: absent at 22:29 UTC on the day itself, present by
 * 00:28 UTC the next day (earliest run on record). `completeThrough` records the newest day present in
 * every volume and fee series, and `awaitClose` lets a run started right after the day change wait for it.
 */
const DEPLOYMENTS = [
  { id: "main", api: "https://mainnet.zklighter.elliot.ai/api/v1" },
  { id: "robinhood", api: "https://api.rh.lighter.xyz/api/v1" },
] as const;
const REVENUE_KINDS = ["maker_fee", "taker_fee", "transfer_fee", "withdraw_fee"] as const;
// The CDN in front of Lighter serves a bot challenge to fast or concurrent clients; stay sequential.
const limiter = new RateLimiter(60, 60_000);

export type LighterSegment = "perps" | "spot" | "robinhood";
export type LighterDay = Record<LighterSegment, number>;
export interface LighterStore {
  updatedAt: string;
  /** Last UTC day present in every volume and fee series of both deployments (never the day the run started on). */
  completeThrough?: Day;
  /** 2 = exchange-metrics based (volume + revenue). */
  version: 2;
  spotMarkets: string[];
  days: Record<Day, LighterDay>;
  /** Protocol revenue per day (maker + taker + transfer + withdrawal fees, both deployments). */
  revenue: Record<Day, number>;
  /** The same revenue split by deployment (zero-filled over the same days, so the parts sum to `revenue`). */
  revenueByDeployment?: { main: Record<Day, number>; robinhood: Record<Day, number> };
  /** Liquidation fees per day, paid to the LLP; kept for reference, not counted as revenue. */
  liquidationFees: Record<Day, number>;
  /**
   * LIT bought back by the treasury per day (Lighter's `buyback` metric, in LIT) and its USD value at
   * that day's LIT/USDC daily price (OHLC/4 on Lighter's spot market). Buybacks began 30 Dec 2025.
   */
  buybacks?: Record<Day, { lit: number; usd: number }>;
}

interface OrderBook { market_id: number; market_type: "perp" | "spot"; symbol: string }

async function metric(api: string, kind: string, market?: string): Promise<Record<Day, number>> {
  await limiter.take();
  const qs = new URLSearchParams({ period: "all", kind });
  if (market) {
    qs.set("filter", "byMarket");
    qs.set("value", market);
  }
  const res = await fetchJson<{ metrics?: { timestamp: number; data: number }[] }>(`${api}/exchangeMetrics?${qs}`);
  const out: Record<Day, number> = {};
  for (const m of res.metrics ?? []) {
    const day = dayFromMs(m.timestamp * 1000);
    out[day] = (out[day] ?? 0) + Number(m.data || 0);
  }
  return out;
}

interface DayCandle { t: number; o: number; h: number; l: number; c: number }

/** LIT/USDC daily prices (OHLC/4) from `fromDay`, paging backwards (the API caps count_back at 500). */
async function litDailyPrices(api: string, fromDay: Day): Promise<Record<Day, number>> {
  const out: Record<Day, number> = {};
  let end = Math.floor(Date.now() / 1000);
  const fromSec = Math.floor(Date.parse(`${fromDay}T00:00:00Z`) / 1000);
  for (let page = 0; page < 10; page++) {
    await limiter.take();
    const qs = new URLSearchParams({ market_id: "2049", resolution: "1d", start_timestamp: String(fromSec), end_timestamp: String(end), count_back: "500" });
    const res = await fetchJson<{ c?: DayCandle[] }>(`${api}/candles?${qs}`);
    const cs = res.c ?? [];
    for (const c of cs) out[dayFromMs(c.t)] = (c.o + c.h + c.l + c.c) / 4;
    if (cs.length < 500) break;
    end = Math.floor(Math.min(...cs.map((c) => c.t)) / 1000) - 1;
    if (end < fromSec) break;
  }
  return out;
}

function add(into: Record<Day, number>, from: Record<Day, number>) {
  for (const [day, v] of Object.entries(from)) into[day] = (into[day] ?? 0) + v;
}

function lastDay(rec: Record<Day, unknown>): Day | undefined {
  let last: Day | undefined;
  for (const d of Object.keys(rec)) if (!last || d > last) last = d;
  return last;
}

async function collectOnce(log: (msg: string) => void): Promise<LighterStore> {
  const startedMs = Date.now();
  const [main, rh] = DEPLOYMENTS;
  // Newest day of each volume and fee series, to tell whether the latest closed day is fully published.
  const published: Day[] = [];
  const core = async (api: string, kind: string) => {
    const m = await metric(api, kind);
    const last = lastDay(m);
    if (last) published.push(last);
    return m;
  };
  await limiter.take();
  const books = (await fetchJson<{ order_books: OrderBook[] }>(`${main.api}/orderBooks`)).order_books;
  const spotMarkets = books.filter((b) => b.market_type === "spot").map((b) => b.symbol).sort();

  const mainVolume = await core(main.api, "volume");
  const rhVolume = await core(rh.api, "volume");
  const spot: Record<Day, number> = {};
  for (const symbol of spotMarkets) add(spot, await metric(main.api, "volume", symbol));

  const revenue: Record<Day, number> = {};
  const revenueByDeployment = { main: {} as Record<Day, number>, robinhood: {} as Record<Day, number> };
  const liquidationFees: Record<Day, number> = {};
  for (const d of DEPLOYMENTS) {
    for (const kind of REVENUE_KINDS) {
      const m = await core(d.api, kind);
      add(revenue, m);
      add(revenueByDeployment[d.id], m);
    }
    add(liquidationFees, await metric(d.api, "liquidation_fee"));
  }
  for (const day of Object.keys(revenue)) {
    revenueByDeployment.main[day] ??= 0;
    revenueByDeployment.robinhood[day] ??= 0;
  }

  const buybackLit = await metric(main.api, "buyback");
  const bbDays = Object.keys(buybackLit).sort();
  let buybacks: LighterStore["buybacks"];
  if (bbDays.length) {
    const px = await litDailyPrices(main.api, bbDays[0]);
    buybacks = {};
    let lastPx = 0;
    for (const day of eachDay(bbDays[0], bbDays[bbDays.length - 1])) {
      if (px[day]) lastPx = px[day];
      const lit = buybackLit[day] ?? 0;
      buybacks[day] = { lit, usd: lit * lastPx };
    }
  }

  const days: Record<Day, LighterDay> = {};
  for (const day of new Set([...Object.keys(mainVolume), ...Object.keys(rhVolume)])) {
    const total = mainVolume[day] ?? 0;
    const s = Math.min(spot[day] ?? 0, total);
    days[day] = { perps: total - s, spot: s, robinhood: rhVolume[day] ?? 0 };
  }
  const sorted = Object.keys(days).sort();
  const completeThrough = published.length ? [...published, addDays(dayFromMs(startedMs), -1)].sort()[0] : undefined;
  log(`lighter: ${sorted.length} days (${sorted[0]} to ${sorted[sorted.length - 1]}), complete through ${completeThrough ?? "?"}, ${spotMarkets.length} spot markets, revenue ${Object.keys(revenue).length} days, buybacks ${bbDays.length} days`);
  return { updatedAt: new Date().toISOString(), completeThrough, version: 2, spotMarkets, days, revenue, revenueByDeployment, liquidationFees, buybacks };
}

/** `awaitClose` only applies this long after 00:00 UTC; later runs take whatever is published. */
const AWAIT_CLOSE_WINDOW_MS = 75 * 60_000;
const AWAIT_CLOSE_RETRY_MS = 60_000;

/** True while the UTC day that just closed is still missing from Lighter's API and it is early enough to wait for it. */
export function shouldAwaitClose(nowMs: number, publishedThrough: Day | undefined): boolean {
  if (nowMs % DAY_MS > AWAIT_CLOSE_WINDOW_MS) return false;
  return !publishedThrough || publishedThrough < addDays(dayFromMs(nowMs), -1);
}

/**
 * Collect the full Lighter history. With `awaitClose`, a run started shortly after 00:00 UTC polls once a
 * minute until Lighter has published the day that just closed (at most until 01:15 UTC), so the scheduled
 * post-midnight run always stores that day. At any other time of day the option does nothing.
 */
export async function collectLighter(_existing: LighterStore | null, log: (msg: string) => void, opts: { awaitClose?: boolean } = {}): Promise<LighterStore> {
  for (;;) {
    if (opts.awaitClose) {
      // One request instead of a full pass while nothing is out yet.
      const probe = lastDay(await metric(DEPLOYMENTS[0].api, "volume"));
      if (shouldAwaitClose(Date.now(), probe)) {
        log(`lighter: ${addDays(dayFromMs(Date.now()), -1)} not published yet (latest ${probe ?? "none"}); checking again in 60s`);
        await sleep(AWAIT_CLOSE_RETRY_MS);
        continue;
      }
    }
    const store = await collectOnce(log);
    if (!opts.awaitClose || !shouldAwaitClose(Date.now(), store.completeThrough)) return store;
    log(`lighter: ${addDays(dayFromMs(Date.now()), -1)} only partly published (complete through ${store.completeThrough}); collecting again in 60s`);
    await sleep(AWAIT_CLOSE_RETRY_MS);
  }
}

/** Rolling 24h USD volume as reported by each deployment's exchangeStats. */
export async function liveLighter24h(): Promise<{ main: number; robinhood: number }> {
  const [main, rh] = await Promise.all(
    DEPLOYMENTS.map((d) => fetchJson<{ daily_usd_volume: number }>(`${d.api}/exchangeStats`)),
  );
  return { main: main.daily_usd_volume, robinhood: rh.daily_usd_volume };
}

/** Last traded LIT price on Lighter's own LIT/USDC spot market. */
export async function litPriceOnLighter(): Promise<number> {
  const stats = await fetchJson<{ order_book_stats: { symbol: string; last_trade_price: number }[] }>(`${DEPLOYMENTS[0].api}/exchangeStats`);
  const row = stats.order_book_stats.find((s) => s.symbol === "LIT/USDC");
  if (!row?.last_trade_price) throw new Error("LIT/USDC not found on Lighter");
  return Number(row.last_trade_price);
}
