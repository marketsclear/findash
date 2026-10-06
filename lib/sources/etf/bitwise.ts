import { fetchJson } from "../../http";
import { nextTradingDay } from "../../days";
import { BROWSER_UA, FundAdapter, num, toDay } from "./types";

/**
 * Bitwise Ethereum ETF (ETHW). Server-rendered fund page: shares outstanding, net assets and ether in
 * trust under "Fund Details, Data as of <date>". That date is the business day *before* the trade date
 * whose creations the share count already includes (Thursday's data = Friday's trades, Sunday's data =
 * Monday's), so the snapshot is dated to the next NYSE trading day and flows use lag 0. Priced at the
 * snapshot's net assets per share. Verified against Farside, 9 Sep - 5 Oct 2026, every non-zero day.
 */
export const ethw: FundAdapter = {
  ticker: "ETHW",
  name: "Bitwise Ethereum ETF",
  issuer: "Bitwise",
  method: "shares",
  history: false,
  sharesLag: 0,
  async fetch() {
    const html = await fetchJson<string>("https://ethwetf.com/", { headers: { "user-agent": BROWSER_UA } }, { parse: "text" });
    const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
    const asOf = text.match(/Data as of (\d{2}\/\d{2}\/\d{4})/)?.[1];
    const shares = num(text.match(/Shares Outstanding ([\d,]+)/)?.[1]);
    const aum = num(text.match(/Net Assets \(AUM\) \$([\d,]+)/)?.[1]);
    const eth = num(text.match(/ETH in Trust ([\d,.]+)/)?.[1]);
    const navMatch = text.match(/as of (\d{2}\/\d{2}\/\d{4}) NAV: \$([\d.]+)/);
    const asOfDay = asOf ? toDay(asOf) : undefined;
    if (!asOfDay || shares === undefined) throw new Error(`ETHW: could not parse page (asOf=${asOf}, shares=${shares})`);
    const date = nextTradingDay(asOfDay);
    const nav = aum !== undefined ? aum / shares : navMatch ? num(navMatch[2]) : undefined;
    return [{ date, shares, nav, aum, eth }];
  },
};
