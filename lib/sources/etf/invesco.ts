import { fetchJson } from "../../http";
import { BROWSER_UA, FundAdapter, toDay } from "./types";

/**
 * Invesco Galaxy Ethereum ETF (QETH). The product page's data API answers non-browser clients as long
 * as the request carries browser-like Accept/Origin/Referer headers. Latest day only.
 */
const BASE = "https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/46148D107";
const headers = {
  "user-agent": BROWSER_UA,
  accept: "application/json, text/plain, */*",
  origin: "https://www.invesco.com",
  referer: "https://www.invesco.com/",
  "accept-language": "en-US,en;q=0.9",
};

export const qeth: FundAdapter = {
  ticker: "QETH",
  name: "Invesco Galaxy Ethereum ETF",
  issuer: "Invesco",
  method: "shares",
  history: false,
  sharesLag: 1,
  lagUnverified: true,
  async fetch() {
    const [prices, details] = await Promise.all([
      fetchJson<{ effectiveDate: string; nav: number; sharesOutstanding: number }>(
        `${BASE}/prices?idType=cusip&variationType=priceListing&productType=ETF&productSubType=ETF-Non-40%20Act`,
        { headers },
      ),
      fetchJson<{ shareclassTotalNetAssets?: number; shareclassTotalNetAssetsEffectiveDate?: string }>(
        `${BASE}?expand=nav&idType=cusip&variationType=fundDetails&productType=ETF`,
        { headers },
      ).catch(() => null),
    ]);
    const date = toDay(prices.effectiveDate);
    if (!date || !prices.sharesOutstanding || !prices.nav) throw new Error(`QETH: unexpected payload ${JSON.stringify(prices).slice(0, 200)}`);
    const aum = details && details.shareclassTotalNetAssetsEffectiveDate === prices.effectiveDate ? details.shareclassTotalNetAssets : prices.nav * prices.sharesOutstanding;
    return [{ date, shares: prices.sharesOutstanding, nav: prices.nav, aum }];
  },
};
