import { browserContext } from "./browser";
import { FundAdapter, num, toDay } from "./types";

/**
 * Fidelity Ethereum Fund (FETH). The institutional research page loads a quote payload with the exact
 * share count (short.freeFloatShares), previous-day NAV and ether held. The site sits behind Akamai bot
 * management, which has been observed to stall automated browsers; this adapter is best-effort.
 */
interface Quote {
  quoteData?: {
    short?: { freeFloatShares?: string };
    navPreviousDay?: { value?: number; asOfDate?: string };
    cryptoDetails?: { totalUnitPerCoin?: number; asOfDate?: string };
    netAssets?: { value?: string; asOfDate?: string };
  };
}

export const feth: FundAdapter = {
  ticker: "FETH",
  name: "Fidelity Ethereum Fund",
  issuer: "Fidelity",
  method: "shares",
  history: false,
  sharesLag: 1,
  lagUnverified: true,
  browser: true,
  async fetch() {
    const ctx = await browserContext();
    try {
      const page = await ctx.newPage();
      let quote: Quote | null = null;
      page.on("response", async (r) => {
        if (r.url().includes("research/api/quote") && r.request().method() === "POST") {
          try { quote = JSON.parse(await r.text()) as Quote; } catch { /* ignore */ }
        }
      });
      page.goto("https://institutional.fidelity.com/prgw/digital/research/quote/dashboard/summary?symbol=FETH", { waitUntil: "commit", timeout: 60_000 }).catch(() => {});
      for (let i = 0; i < 60 && !quote; i++) await page.waitForTimeout(1000);
      const q = (quote as Quote | null)?.quoteData;
      if (!q) throw new Error("FETH: quote payload not observed (bot protection?)");
      const shares = num(q.short?.freeFloatShares);
      const nav = q.navPreviousDay?.value;
      const date = q.navPreviousDay?.asOfDate ? toDay(q.navPreviousDay.asOfDate) : undefined;
      if (!date || shares === undefined || nav === undefined) throw new Error(`FETH: incomplete quote ${JSON.stringify(q).slice(0, 200)}`);
      const ethDate = q.cryptoDetails?.asOfDate ? toDay(q.cryptoDetails.asOfDate) : undefined;
      const eth = ethDate === date ? q.cryptoDetails?.totalUnitPerCoin : undefined;
      return [{ date, shares, nav, aum: nav * shares, eth }];
    } finally {
      await ctx.close();
    }
  },
};
