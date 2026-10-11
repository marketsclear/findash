import { addDays, Day, dayFromMs, dayToMs, eachDay, todayUtc } from "../days";
import { RateLimiter } from "../http";
import { info, type SpotMeta } from "./hyperliquid";

/**
 * Hyperliquid revenue = USD the Assistance Fund spends buying HYPE, per UTC day, read from the
 * fund's own fills on Hyperliquid (info API, `userFillsByTime`). Trading fees (after HLP's 1%,
 * builder-code fees and HIP-3 deployer shares) flow to the fund, which buys HYPE continuously; this
 * is what Hyperliquid's stats site reports as "HyperCore buybacks". Verified 30 Sep 2026: our sums
 * for 26-29 Sep equal the stats site's figures to the dollar. HYPE burned in HIP-1/HIP-3 deployment
 * auctions and as HyperEVM fees is not included (0.4% of revenue over the 30 days to 29 Sep 2026,
 * 1.8% over the year).
 *
 * Parts. Since 26 Aug 2026 the fund also receives stablecoin reserve-yield payments under
 * Hyperliquid's Aligned Quote Asset framework (AQAv2: the USDC deployers pass ~90% of cost-adjusted
 * reserve yield on USDC held on Hyperliquid to the fund, accrued over 30 days and paid about eight
 * days later). Payments arrive through a protocol address (0x5000...0000) that forwards them to the
 * fund at 00:00 UTC; the first, 14,580,774.69 USDC, landed on 4 Oct 2026 and was spent on HYPE over
 * 4-5 Oct. The collector records these payments from the fund's ledger, and `splitBuybacks` divides
 * each day's buybacks into "trading fees" and "stablecoin reserve yield" (see its comment). Totals are
 * unaffected by the split.
 *
 * The API serves only a user's most recent 10,000 fills, about ten days at the current pace, so the
 * collector must run at least weekly. History before the first collection comes from a one-time seed
 * of the stats site's buyback series (scripts/hl-seed-buybacks.ts), kept apart in `seed`.
 */
const ASSISTANCE_FUND = "0xfefefefefefefefefefefefefefefefefefefefe";
/** Protocol address that forwards reserve-yield payments to the fund at 00:00 UTC. */
const YIELD_ROUTER = "0x5000000000000000000000000000000000000000";
const MAX_FILLS = 2000; // per response
const YIELD_MIN_USD = 1_000; // the route was tested with 1-2 USDC transfers before the first payment
const YIELD_LOOKBACK_DAYS = 45;
const limiter = new RateLimiter(600, 60_000); // userFillsByTime weighs 20; stay well inside 1200/min

export interface YieldPayment {
  time: string;
  day: Day;
  amount: number;
  from: string;
}

export interface HlRevenueStore {
  updatedAt: string;
  /** Buyback USD per day from the fund's fills (first-party). */
  days: Record<Day, number>;
  /** One-time history seed for days before the first collection. Never overwrites `days`. */
  seed?: { source: string; capturedAt: string; days: Record<Day, number> };
  /** Stablecoin reserve-yield payments received by the fund (AQAv2), by receipt time. */
  yieldPayments?: YieldPayment[];
}

interface Fill { coin: string; px: string; sz: string; side: "B" | "A"; time: number; tid: number; hash: string }
interface Ledger { time: number; delta: { type: string; user?: string; destination?: string; token?: string; amount?: string } }

async function fills(startMs: number, endMs: number): Promise<Fill[]> {
  await limiter.take(20);
  const chunk = await info<Fill[]>({ type: "userFillsByTime", user: ASSISTANCE_FUND, startTime: startMs, endTime: endMs });
  if (chunk.length < MAX_FILLS || endMs - startMs < 60_000) return chunk;
  // Response was capped: split the window.
  const mid = Math.floor((startMs + endMs) / 2);
  return [...(await fills(startMs, mid)), ...(await fills(mid + 1, endMs))];
}

/** Daily HYPE buybacks for [startDay, today], plus the first day fully covered by the API's history. */
export async function assistanceFundBuybacks(startDay: Day): Promise<{ byDay: Record<Day, number>; coveredFrom: Day }> {
  const meta = await info<SpotMeta>({ type: "spotMeta" });
  const name = new Map(meta.tokens.map((t) => [t.index, t.name]));
  // Pairs with HYPE as the base token; all of them are quoted in USD stablecoins.
  const hypePairs = new Set(meta.universe.filter((u) => name.get(u.tokens[0]) === "HYPE").map((u) => u.name));

  const start = dayToMs(startDay);
  // Also read the two days before `startDay`: finding fills there proves the API's history reaches
  // back past the start. (The fund can pause for a few hours, so a late first fill on the start day
  // alone proves nothing: on 18 Sep 2026 it made no purchase between 00:00 and 02:16 UTC.)
  const probeStart = dayToMs(addDays(startDay, -2));
  const now = Date.now();
  const seen = new Set<string>();
  const all: Fill[] = [];
  for (let t = probeStart; t < now; t += 6 * 3_600_000) {
    for (const f of await fills(t, Math.min(t + 6 * 3_600_000, now) - 1)) {
      const key = `${f.tid}:${f.hash}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(f);
      }
    }
  }
  if (all.length === 0) throw new Error("Assistance Fund: no fills returned");
  // If no fill precedes `start`, the API's history did not reach back that far: the day of the
  // earliest fill may be incomplete, so coverage starts the day after it.
  const earliest = Math.min(...all.map((f) => f.time));
  const coveredFrom = earliest < start ? startDay : addDays(dayFromMs(earliest), 1);

  const byDay: Record<Day, number> = {};
  for (const day of eachDay(coveredFrom, todayUtc())) byDay[day] = 0;
  for (const f of all) {
    if (f.side !== "B" || !hypePairs.has(f.coin)) continue;
    const day = dayFromMs(f.time);
    if (day in byDay) byDay[day] += Number(f.px) * Number(f.sz);
  }
  return { byDay, coveredFrom };
}

/** Reserve-yield payments routed to the fund since `startDay`, from the fund's own ledger. */
export async function yieldPaymentsSince(startDay: Day): Promise<YieldPayment[]> {
  await limiter.take(20);
  const entries = await info<Ledger[]>({ type: "userNonFundingLedgerUpdates", user: ASSISTANCE_FUND, startTime: dayToMs(startDay), endTime: Date.now() });
  return entries
    .filter(
      (e) =>
        e.delta.type === "send" &&
        e.delta.user?.toLowerCase() === YIELD_ROUTER &&
        e.delta.destination?.toLowerCase() === ASSISTANCE_FUND &&
        e.delta.token === "USDC" &&
        Number(e.delta.amount) >= YIELD_MIN_USD,
    )
    .map((e) => ({ time: new Date(e.time).toISOString(), day: dayFromMs(e.time), amount: Number(e.delta.amount), from: e.delta.user! }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export async function collectHlRevenue(existing: HlRevenueStore | null, log: (msg: string) => void): Promise<HlRevenueStore> {
  const known = Object.keys(existing?.days ?? {}).sort();
  // Re-read the last three stored days (the current one was partial when stored); on the first run,
  // take everything the API still has.
  const startDay = known.length ? addDays(known[known.length - 1], -2) : addDays(todayUtc(), -12);
  const { byDay, coveredFrom } = await assistanceFundBuybacks(startDay);
  if (coveredFrom > startDay) {
    log(`hyperliquid revenue: WARNING fills only reach back to ${coveredFrom}; days ${startDay} to ${addDays(coveredFrom, -1)} keep their previous values`);
  }
  const days = { ...(existing?.days ?? {}), ...byDay };

  const lookbackFrom = addDays(todayUtc(), -YIELD_LOOKBACK_DAYS);
  const recent = await yieldPaymentsSince(lookbackFrom);
  const kept = (existing?.yieldPayments ?? []).filter((p) => p.day < lookbackFrom);
  const yieldPayments = [...kept, ...recent].sort((a, b) => a.time.localeCompare(b.time));

  const sorted = Object.keys(days).sort();
  log(`hyperliquid revenue: ${sorted.length} days of buybacks (${sorted[0]} to ${sorted[sorted.length - 1]}), ${yieldPayments.length} reserve-yield payment${yieldPayments.length === 1 ? "" : "s"} on record`);
  return { updatedAt: new Date().toISOString(), days, seed: existing?.seed, yieldPayments };
}

/**
 * Split daily buybacks into a fee-funded and a yield-funded part. A payment lands at 00:00 UTC and the
 * fund spends it over the following day or two on top of its usual fee-funded buying, so each payment
 * is attributed to its "spending window": the receipt day plus the following days (at most five) while
 * buybacks stay above 1.5x the fund's typical pace (median of the prior 14 days), in proportion to each
 * day's buybacks. The yield part never exceeds the day's buybacks, so fees = buybacks - yield >= 0 and
 * the two parts always sum to the total. First payment (14.58M, 4 Oct 2026): window 4-5 Oct, buybacks
 * 8.18M + 9.12M, so 6.89M + 7.69M attributed to yield and 1.29M + 1.43M to fees.
 */
export function splitBuybacks(days: Record<Day, number>, payments: YieldPayment[]): { fees: Record<Day, number>; yield: Record<Day, number> } {
  const sorted = Object.keys(days).sort();
  const yieldByDay: Record<Day, number> = {};
  for (const d of sorted) yieldByDay[d] = 0;
  for (const p of payments) {
    const idx = sorted.indexOf(p.day);
    if (idx < 0) continue; // payment outside the collected series
    const prior = sorted.slice(Math.max(0, idx - 14), idx).map((d) => days[d]).sort((a, b) => a - b);
    const typical = prior.length ? prior[Math.floor(prior.length / 2)] : 0;
    const window: Day[] = [p.day];
    for (let i = idx + 1; i < sorted.length && i <= idx + 5; i++) {
      if (days[sorted[i]] > 1.5 * typical) window.push(sorted[i]);
      else break;
    }
    const spent = window.reduce((s, d) => s + days[d], 0);
    const allocate = Math.min(p.amount, spent);
    if (spent > 0) for (const d of window) yieldByDay[d] += allocate * (days[d] / spent);
  }
  const fees: Record<Day, number> = {};
  for (const d of sorted) {
    yieldByDay[d] = Math.min(yieldByDay[d], days[d]);
    fees[d] = days[d] - yieldByDay[d];
  }
  return { fees, yield: yieldByDay };
}

/** Buyback series for display: the seed for days before the first collected day, then collected data, with parts. */
export function hlRevenueSeries(store: HlRevenueStore | null): {
  days: Record<Day, number>;
  parts: { fees: Record<Day, number>; yield: Record<Day, number> };
  seededThrough: Day | null;
  yieldPayments: YieldPayment[];
} {
  if (!store) return { days: {}, parts: { fees: {}, yield: {} }, seededThrough: null, yieldPayments: [] };
  const first = Object.keys(store.days).sort()[0];
  const days: Record<Day, number> = {};
  let seededThrough: Day | null = null;
  for (const [day, v] of Object.entries(store.seed?.days ?? {})) {
    if (!first || day < first) {
      days[day] = v;
      if (!seededThrough || day > seededThrough) seededThrough = day;
    }
  }
  Object.assign(days, store.days);
  const parts = splitBuybacks(days, store.yieldPayments ?? []);
  return { days, parts, seededThrough, yieldPayments: store.yieldPayments ?? [] };
}
