import { fetchJson } from "../../http";
import { BROWSER_UA, FundAdapter, num, toDay } from "./types";

/**
 * Bitwise Ethereum ETF (ETHW). Server-rendered fund page: shares outstanding, net assets and ether in
 * trust under "Fund Details, Data as of <date>"; NAV carries its own as-of date.
 */
export const ethw: FundAdapter = {
  ticker: "ETHW",
  name: "Bitwise Ethereum ETF",
  issuer: "Bitwise",
  method: "shares",
  history: false,
  sharesLag: 1,
  lagUnverified: true,
  async fetch() {
    const html = await fetchJson<string>("https://ethwetf.com/", { headers: { "user-agent": BROWSER_UA } }, { parse: "text" });
    const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
    const asOf = text.match(/Data as of (\d{2}\/\d{2}\/\d{4})/)?.[1];
    const shares = num(text.match(/Shares Outstanding ([\d,]+)/)?.[1]);
    const aum = num(text.match(/Net Assets \(AUM\) \$([\d,]+)/)?.[1]);
    const eth = num(text.match(/ETH in Trust ([\d,.]+)/)?.[1]);
    const navMatch = text.match(/as of (\d{2}\/\d{2}\/\d{4}) NAV: \$([\d.]+)/);
    const date = asOf ? toDay(asOf) : undefined;
    if (!date || shares === undefined) throw new Error(`ETHW: could not parse page (asOf=${asOf}, shares=${shares})`);
    const navDate = navMatch ? toDay(navMatch[1]) : undefined;
    // Prefer the NAV struck on the same date; otherwise derive it from net assets.
    const nav = navDate === date ? num(navMatch![2]) : aum !== undefined ? aum / shares : undefined;
    return [{ date, shares, nav, aum, eth }];
  },
};
