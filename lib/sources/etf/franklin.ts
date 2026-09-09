import { browserContext } from "./browser";
import { FundAdapter, num, toDay } from "./types";

/** Franklin Ethereum ETF (EZET). Data arrives through persisted GraphQL queries, so read the rendered page. */
export const ezet: FundAdapter = {
  ticker: "EZET",
  name: "Franklin Ethereum ETF",
  issuer: "Franklin Templeton",
  method: "shares",
  history: false,
  sharesLag: 1,
  lagUnverified: true,
  browser: true,
  async fetch() {
    const ctx = await browserContext();
    try {
      const page = await ctx.newPage();
      await page.goto("https://www.franklintempleton.com/investments/options/exchange-traded-funds/products/40521/SINGLCLASS/franklin-ethereum-etf/EZET", {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForFunction(() => /Shares Outstanding\s*[\d,]+/.test(document.body.innerText), null, { timeout: 45_000 });
      const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
      const shares = num(text.match(/Shares Outstanding ([\d,]+)/)?.[1]);
      const navM = text.match(/NAV .*?\$([\d.]+) As of (\d{2}\/\d{2}\/\d{4})/);
      const tnaM = text.match(/Total Net Assets \$([\d.]+)([MBK])? As of (\d{2}\/\d{2}\/\d{4})/);
      const date = navM ? toDay(navM[2]) : tnaM ? toDay(tnaM[3]) : undefined;
      if (!date || shares === undefined) throw new Error(`EZET: could not parse page (shares=${shares}, nav=${navM?.[0]})`);
      const nav = navM ? num(navM[1]) : undefined;
      const mult = { K: 1e3, M: 1e6, B: 1e9 }[tnaM?.[2] ?? ""] ?? 1;
      const aum = tnaM ? num(tnaM[1])! * mult : nav !== undefined ? nav * shares : undefined;
      return [{ date, shares, nav, aum }];
    } finally {
      await ctx.close();
    }
  },
};
