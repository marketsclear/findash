import { Day, dayFromMs } from "../days";
import { fetchJson, RateLimiter } from "../http";

/**
 * Lighter volume and revenue from Lighter's own exchange-metrics API, which serves the full daily
 * history in one request per metric (timestamps are UTC midnights, in seconds):
 *  - volume: `kind=volume` per deployment (main zkLighter exchange and the Robinhood deployment).
 *    Spot is the sum of `filter=byMarket` volume over the main exchange's spot order books; perps is
 *    the rest. Checked on 30 Sep 2026: our earlier per-market candle sums ran 0.1-0.2% below this
 *    series, mostly because delisted markets drop out of the candle sweep.
 *  - revenue: maker + taker + transfer + withdrawal fees on both deployments, i.e. fees the protocol
 *    keeps. Liquidation fees go to the LLP insurance fund and are stored separately, not as revenue.
 *    This is the same definition DefiLlama uses, computed from the same source, without its gaps.
 * Every run rewrites the whole history, so there is no backfill state to manage.
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
  /** 2 = exchange-metrics based (volume + revenue). */
  version: 2;
  spotMarkets: string[];
  days: Record<Day, LighterDay>;
  /** Protocol revenue per day (maker + taker + transfer + withdrawal fees, both deployments). */
  revenue: Record<Day, number>;
  /** Liquidation fees per day, paid to the LLP; kept for reference, not counted as revenue. */
  liquidationFees: Record<Day, number>;
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

function add(into: Record<Day, number>, from: Record<Day, number>) {
  for (const [day, v] of Object.entries(from)) into[day] = (into[day] ?? 0) + v;
}

export async function collectLighter(_existing: LighterStore | null, log: (msg: string) => void): Promise<LighterStore> {
  const [main, rh] = DEPLOYMENTS;
  await limiter.take();
  const books = (await fetchJson<{ order_books: OrderBook[] }>(`${main.api}/orderBooks`)).order_books;
  const spotMarkets = books.filter((b) => b.market_type === "spot").map((b) => b.symbol).sort();

  const mainVolume = await metric(main.api, "volume");
  const rhVolume = await metric(rh.api, "volume");
  const spot: Record<Day, number> = {};
  for (const symbol of spotMarkets) add(spot, await metric(main.api, "volume", symbol));

  const revenue: Record<Day, number> = {};
  const liquidationFees: Record<Day, number> = {};
  for (const d of DEPLOYMENTS) {
    for (const kind of REVENUE_KINDS) add(revenue, await metric(d.api, kind));
    add(liquidationFees, await metric(d.api, "liquidation_fee"));
  }

  const days: Record<Day, LighterDay> = {};
  for (const day of new Set([...Object.keys(mainVolume), ...Object.keys(rhVolume)])) {
    const total = mainVolume[day] ?? 0;
    const s = Math.min(spot[day] ?? 0, total);
    days[day] = { perps: total - s, spot: s, robinhood: rhVolume[day] ?? 0 };
  }
  const sorted = Object.keys(days).sort();
  log(`lighter: ${sorted.length} days (${sorted[0]} to ${sorted[sorted.length - 1]}), ${spotMarkets.length} spot markets, revenue ${Object.keys(revenue).length} days`);
  return { updatedAt: new Date().toISOString(), version: 2, spotMarkets, days, revenue, liquidationFees };
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
