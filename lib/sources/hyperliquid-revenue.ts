import { addDays, Day, dayFromMs, dayToMs, eachDay, todayUtc } from "../days";
import { RateLimiter } from "../http";
import { info, type SpotMeta } from "./hyperliquid";

/**
 * Hyperliquid revenue = USD the Assistance Fund spends buying HYPE, per UTC day, read from the
 * fund's own fills on Hyperliquid (info API, `userFillsByTime`). Trading fees (after HLP's 1%,
 * builder-code fees and HIP-3 deployer shares) flow to the fund, which buys HYPE continuously; this
 * is what Hyperliquid's stats site reports as "HyperCore buybacks". Verified 30 Sep 2026: our sums
 * for 26-29 Sep equal the stats site's figures to the dollar. HIP-1/HIP-3 deployment-auction burns
 * (about 0.4% of revenue over the last 30 days) are not included.
 *
 * The API serves only a user's most recent 10,000 fills, about ten days at the current pace, so the
 * collector must run at least weekly. History before the first collection comes from a one-time seed
 * of the stats site's buyback series (scripts/hl-seed-buybacks.ts), kept apart in `seed`.
 */
const ASSISTANCE_FUND = "0xfefefefefefefefefefefefefefefefefefefefe";
const MAX_FILLS = 2000; // per response
const limiter = new RateLimiter(600, 60_000); // userFillsByTime weighs 20; stay well inside 1200/min

export interface HlRevenueStore {
  updatedAt: string;
  /** Buyback USD per day from the fund's fills (first-party). */
  days: Record<Day, number>;
  /** One-time history seed for days before the first collection. Never overwrites `days`. */
  seed?: { source: string; capturedAt: string; days: Record<Day, number> };
}

interface Fill { coin: string; px: string; sz: string; side: "B" | "A"; time: number; tid: number; hash: string }

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
  const sorted = Object.keys(days).sort();
  log(`hyperliquid revenue: ${sorted.length} days of buybacks (${sorted[0]} to ${sorted[sorted.length - 1]})`);
  return { updatedAt: new Date().toISOString(), days, seed: existing?.seed };
}

/** Buyback series for display: the seed for days before the first collected day, then collected data. */
export function hlRevenueSeries(store: HlRevenueStore | null): { days: Record<Day, number>; seededThrough: Day | null } {
  if (!store) return { days: {}, seededThrough: null };
  const first = Object.keys(store.days).sort()[0];
  const out: Record<Day, number> = {};
  let seededThrough: Day | null = null;
  for (const [day, v] of Object.entries(store.seed?.days ?? {})) {
    if (!first || day < first) {
      out[day] = v;
      if (!seededThrough || day > seededThrough) seededThrough = day;
    }
  }
  Object.assign(out, store.days);
  return { days: out, seededThrough };
}
