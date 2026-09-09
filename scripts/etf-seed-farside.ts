/**
 * Merge data/farside-seed.json (posted by a browser tab via /api/seed/farside) into the ETF store as
 * secondary-source flows for the funds whose issuers publish no history. Runs against the file store
 * or, with DATABASE_URL set, against Postgres.
 *
 *   pnpm tsx scripts/etf-seed-farside.ts            # local files
 *   DATABASE_URL=... pnpm tsx scripts/etf-seed-farside.ts
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { EtfStore } from "../lib/sources/etf";
import { readStore, writeStore } from "../lib/store";

const SEED_FUNDS = ["FETH", "ETHW", "ETHV", "QETH", "EZET"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function day(s: string): string | null {
  const m = s.match(/^(\d{1,2}) (\w{3}) (\d{4})$/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2].toLowerCase());
  return mon < 0 ? null : `${m[3]}-${String(mon + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

async function main() {
  const dir = process.env.FINDASH_DATA_DIR ?? path.join(process.cwd(), "data");
  const parts = (await readdir(dir)).filter((f) => /^farside-seed\.part-\d+\.json$/.test(f)).sort();
  if (parts.length === 0) throw new Error("no farside-seed.part-*.json files in data/");
  const seed = { capturedAt: "", want: [] as string[], out: [] as (string | number | null)[][] };
  for (const f of parts) {
    const p = JSON.parse(await readFile(path.join(dir, f), "utf8")) as typeof seed;
    seed.capturedAt = p.capturedAt;
    seed.want = p.want;
    seed.out.push(...p.out);
  }
  console.log(`${parts.length} parts, ${seed.out.length} rows`);
  const store = await readStore<EtfStore>("etf-eth");
  if (!store) throw new Error("etf-eth store is empty; run the collector first");
  for (const ticker of SEED_FUNDS) {
    const col = seed.want.indexOf(ticker) + 1;
    if (col <= 0) throw new Error(`${ticker} not in seed columns`);
    const flows: Record<string, number> = {};
    for (const row of seed.out) {
      const d = day(String(row[0]));
      const v = row[col];
      if (d && typeof v === "number") flows[d] = v * 1e6;
    }
    const fund = store.funds[ticker];
    if (!fund) throw new Error(`${ticker} missing from store`);
    fund.seed = { source: "farside.co.uk/ethereum-etf-flow-all-data", capturedAt: seed.capturedAt, flows };
    const days = Object.keys(flows).sort();
    console.log(`${ticker}: ${days.length} seeded days ${days[0]} → ${days[days.length - 1]}`);
  }
  await writeStore("etf-eth", store);
  console.log("written");
}

void main();
