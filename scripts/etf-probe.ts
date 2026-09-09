import { ADAPTERS } from "../lib/sources/etf/registry";
import { closeBrowser } from "../lib/sources/etf/browser";

async function main() {
  const only = process.argv[2]?.split(",");
  for (const a of ADAPTERS) {
    if (only && !only.includes(a.ticker)) continue;
    const t0 = Date.now();
    try {
      const rows = await a.fetch();
      const sorted = [...rows].sort((x, y) => x.date.localeCompare(y.date));
      const last = sorted[sorted.length - 1];
      console.log(`${a.ticker.padEnd(5)} ok ${String(rows.length).padStart(4)} rows  ${sorted[0].date} → ${last.date}  latest=${JSON.stringify(last)}  ${Date.now() - t0}ms`);
    } catch (err) {
      console.log(`${a.ticker.padEnd(5)} FAIL ${(err as Error).message.slice(0, 160)}  ${Date.now() - t0}ms`);
    }
  }
  await closeBrowser();
}
void main();
