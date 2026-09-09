import { impersonateFetch } from "./impersonate";
import { FundAdapter, num, toDay } from "./types";

/**
 * Morgan Stanley Ethereum Trust (MSSE, NYSE Arca, listed 28 Jul 2026). The product page reads a set of
 * JSON documents; pricing carries NAV, its date and shares outstanding, the trade-date holdings file the
 * ether quantity and market value. The site refuses non-browser TLS fingerprints, so requests go
 * through the impersonating helper. Latest day only (a NAV history chart exists, but no share history).
 */
const BASE = "https://www.morganstanley.com/im/json/imwebdata/data/product/EF/100770";

interface Pricing {
  en?: { shareClasses?: { currencies?: { pricings?: { nav6f?: string; nav?: string; navAsOfDate?: string; outstandingShares?: string } }[] }[] };
}
interface Holdings {
  en?: { holdings?: { quantity?: number | string; marketValueBase?: string; asOfDate?: string }[]; asOfDate?: string; dateControl?: { holdingsDate?: string } };
}

export const msse: FundAdapter = {
  ticker: "MSSE",
  name: "Morgan Stanley Ethereum Trust",
  issuer: "Morgan Stanley",
  method: "shares",
  history: false,
  sharesLag: 1,
  lagUnverified: true,
  async fetch() {
    const [p, h] = await impersonateFetch([
      { url: `${BASE}/detail/en-pricing.json`, headers: { accept: "application/json" } },
      { url: `${BASE}/chart/etfTradeDateHoldingsCurrent.json`, headers: { accept: "application/json" } },
    ]);
    if (p.status !== 200) throw new Error(`MSSE: pricing ${p.status}`);
    const pr = (JSON.parse(p.text) as Pricing).en?.shareClasses?.[0]?.currencies?.[0]?.pricings;
    const date = pr?.navAsOfDate ? toDay(pr.navAsOfDate) : undefined;
    const nav = num(pr?.nav6f ?? pr?.nav);
    const shares = num(pr?.outstandingShares);
    if (!date || nav === undefined || shares === undefined) throw new Error(`MSSE: incomplete pricing ${JSON.stringify(pr).slice(0, 200)}`);
    let eth: number | undefined, aum: number | undefined;
    if (h.status === 200) {
      const row = (JSON.parse(h.text) as Holdings).en?.holdings?.[0];
      eth = num(row?.quantity);
      aum = num(row?.marketValueBase);
    }
    return [{ date, shares, nav, aum: aum ?? nav * shares, eth }];
  },
};
