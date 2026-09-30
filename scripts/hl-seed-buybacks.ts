/**
 * One-time history seed for Hyperliquid revenue: merges data/hl-buybacks-seed.part-*.json (the
 * "HyperCore Buybacks" daily series from Hyperliquid's stats site, captured in a browser tab via
 * /api/seed/hl-buybacks) into the hl-revenue store as `seed`. Before writing, it compares the seed with
 * the buybacks collected from the Assistance Fund's own fills for the days both cover, and refuses to
 * write if any day differs by more than 0.5%.
 *
 *   pnpm tsx scripts/hl-seed-buybacks.ts                # local file store
 *   DATABASE_URL=... pnpm tsx scripts/hl-seed-buybacks.ts
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { HlRevenueStore } from "../lib/sources/hyperliquid-revenue";
import { readStore, writeStore } from "../lib/store";

async function main() {
  const dir = process.env.FINDASH_DATA_DIR ?? path.join(process.cwd(), "data");
  const parts = (await readdir(dir)).filter((f) => /^hl-buybacks-seed\.part-\d+\.json$/.test(f)).sort();
  if (parts.length === 0) throw new Error("no hl-buybacks-seed.part-*.json files in data/");
  const days: Record<string, number> = {};
  let capturedAt = "";
  for (const f of parts) {
    const p = JSON.parse(await readFile(path.join(dir, f), "utf8")) as { capturedAt: string; body: [string, number][] };
    capturedAt = p.capturedAt;
    for (const [day, usd] of p.body) days[day] = usd;
  }
  const sorted = Object.keys(days).sort();
  console.log(`${parts.length} parts, ${sorted.length} days ${sorted[0]} to ${sorted[sorted.length - 1]}`);

  const store = await readStore<HlRevenueStore>("hl-revenue");
  if (!store) throw new Error("hl-revenue store is empty; run the collector first");
  // Compare on complete days both series cover (skip the first collected day, which may be partial).
  const collected = Object.keys(store.days).sort().slice(1);
  let worst = 0;
  for (const day of collected) {
    if (!(day in days) || store.days[day] === 0) continue;
    const diff = Math.abs(days[day] / store.days[day] - 1);
    worst = Math.max(worst, diff);
    console.log(`  ${day}: seed ${days[day].toFixed(2)}  fills ${store.days[day].toFixed(2)}  diff ${(diff * 100).toFixed(3)}%`);
  }
  if (worst > 0.005) throw new Error(`seed disagrees with the fund's fills by up to ${(worst * 100).toFixed(2)}%; not writing`);
  store.seed = { source: "Hyperliquid stats site (api-hyperliquid.asxn.xyz /api/buyback/revenues, HyperCore Buybacks)", capturedAt, days };
  await writeStore("hl-revenue", store);
  console.log("written");
}

void main();
