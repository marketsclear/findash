/**
 * Recollect the Lighter store (adds `buybacks`), optionally write it (`--write`), then print the
 * valuation-metrics table from production data next to an independent recomputation of the key
 * ratios from the raw stores. Run: pnpm tsx --env-file=.env.local scripts/valuation-check.ts [--write]
 */
import { readStore, writeStore } from "../lib/store";
import { collectLighter, type LighterStore } from "../lib/sources/lighter";
import { getDashboardData } from "../lib/dashboard";
import { hlRevenueSeries, type HlRevenueStore } from "../lib/sources/hyperliquid-revenue";
import { eachDay } from "../lib/days";

async function main() {
  const write = process.argv.includes("--write");
  const existing = await readStore<LighterStore>("lighter");
  const t0 = Date.now();
  const fresh = await collectLighter(existing, (m) => console.log(m));
  console.log(`collected in ${Math.round((Date.now() - t0) / 1000)}s`);
  const bb = fresh.buybacks ?? {};
  const bbDays = Object.keys(bb).sort();
  console.log(`buybacks: ${bbDays.length} days ${bbDays[0]} to ${bbDays[bbDays.length - 1]}; LIT total ${Object.values(bb).reduce((s, x) => s + x.lit, 0).toFixed(0)}, USD total ${Object.values(bb).reduce((s, x) => s + x.usd, 0).toFixed(0)}`);
  console.log("last 5 buyback days:", bbDays.slice(-5).map((d) => `${d} ${bb[d].lit.toFixed(0)} LIT $${bb[d].usd.toFixed(0)} (px ${(bb[d].usd / bb[d].lit).toFixed(3)})`).join(" | "));
  const sane = Object.keys(fresh.days).length >= 300 && Object.keys(fresh.revenue).length >= 300 && bbDays.length >= 290;
  if (!sane) throw new Error("fresh Lighter store fails sanity checks; not written");
  if (write) {
    await writeStore("lighter", fresh);
    console.log("wrote lighter store");
  }

  const data = await getDashboardData();
  const vm = data.valuationMetrics;
  if (!vm) throw new Error("no valuation metrics (valuation missing?)");
  console.log(`\nasOf ${data.asOf}`);
  for (const r of vm.rows) console.log(`${r.group.padEnd(11)} ${r.label.padEnd(42)} HL ${String(r.hyperliquid === null ? "-" : r.hyperliquid.toFixed(4)).padStart(20)}  LI ${String(r.lighter === null ? "-" : r.lighter.toFixed(4)).padStart(20)}`);

  // Independent recomputation from the raw stores.
  const m = data.windows.find((w) => w.key === "monthly")!;
  const y = data.windows.find((w) => w.key === "yearly")!;
  const hlRev = hlRevenueSeries(await readStore<HlRevenueStore>("hl-revenue")).days;
  const li = write ? fresh : (await readStore<LighterStore>("lighter"))!;
  const sum = (days: Record<string, number>, from: string, to: string) => eachDay(from, to).reduce((s, d) => s + (days[d] ?? 0), 0);
  const v = data.valuation!;
  const hl30 = sum(hlRev, m.start, m.end), hl365 = sum(hlRev, y.start, y.end);
  const li30 = sum(li.revenue, m.start, m.end), li365 = sum(li.revenue, y.start, y.end);
  const liBb30 = sum(Object.fromEntries(Object.entries(bb).map(([d, x]) => [d, x.usd])), m.start, m.end);
  const liMain30 = sum(li.revenueByDeployment!.main, m.start, m.end);
  console.log(`\nraw: monthly ${m.start}..${m.end}, yearly ${y.start}..${y.end}`);
  console.log(`HL  rev30 ${hl30.toFixed(0)} rev365 ${hl365.toFixed(0)} fdv ${v.hype.fdv.toFixed(0)} mcap ${v.hype.marketCap.toFixed(0)} -> P/E fdv30 ${(v.hype.fdv / (hl30 * 365 / 30)).toFixed(2)} fdv365 ${(v.hype.fdv / hl365).toFixed(2)} mcap30 ${(v.hype.marketCap / (hl30 * 365 / 30)).toFixed(2)}`);
  console.log(`LI  rev30 ${li30.toFixed(0)} rev365 ${li365.toFixed(0)} fdv ${v.lit.fdv.toFixed(0)} mcap ${v.lit.marketCap.toFixed(0)} -> P/E fdv30 ${(v.lit.fdv / (li30 * 365 / 30)).toFixed(2)} fdv365 ${(v.lit.fdv / li365).toFixed(2)} mcap30 ${(v.lit.marketCap / (li30 * 365 / 30)).toFixed(2)}`);
  console.log(`LI  buybacks 30d $${liBb30.toFixed(0)} vs main-exchange fees 30d $${liMain30.toFixed(0)} (${((liBb30 / liMain30) * 100).toFixed(1)}%)`);
  process.exit(0);
}

void main().catch((e) => { console.error(e); process.exit(1); });
