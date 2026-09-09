import { fetchJson } from "../../http";
import { BROWSER_UA, FundAdapter, FundSnapshot, toDay } from "./types";

/** 21Shares Ethereum Staking ETF (TETH, formerly CETH). Open JSON API with full valuation history. */
const API = "https://api.primary.21shares.com/api";

interface History { data: { valuation_date: string; total_units_outstanding: number; nav_per_share: number; total_nav: number }[] }
interface Details { data: { valuation_date: string; total_units_outstanding: number; nav_per_unit: number; total_nav: number; constituents: { ticker: string; quantity: number }[] } }

export const teth: FundAdapter = {
  ticker: "TETH",
  name: "21Shares Ethereum Staking ETF",
  issuer: "21Shares",
  method: "shares",
  history: true,
  sharesLag: 0,
  async fetch() {
    const headers = { "user-agent": BROWSER_UA, accept: "application/json" };
    const [hist, det] = await Promise.all([
      fetchJson<History>(`${API}/product_valuation_history/TETH`, { headers }),
      fetchJson<Details>(`${API}/product_details/TETH`, { headers }),
    ]);
    const byDate = new Map<string, FundSnapshot>();
    for (const r of hist.data ?? []) {
      const date = toDay(r.valuation_date);
      if (!date) continue;
      byDate.set(date, { date, shares: r.total_units_outstanding, nav: r.nav_per_share, aum: r.total_nav });
    }
    const d = det.data;
    const date = d && toDay(d.valuation_date);
    if (date) {
      const eth = d.constituents?.find((c) => c.ticker === "ETH")?.quantity;
      byDate.set(date, { ...(byDate.get(date) ?? { date }), shares: d.total_units_outstanding, nav: d.nav_per_unit, aum: d.total_nav, eth });
    }
    if (byDate.size === 0) throw new Error("TETH: no data");
    return [...byDate.values()];
  },
};
