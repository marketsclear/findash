import { impersonateFetch } from "./impersonate";
import { FundAdapter, toDay } from "./types";

/**
 * Invesco Galaxy Ethereum ETF (QETH). The product page's data API sits behind Akamai and rejects
 * non-browser TLS fingerprints (406), so requests go through the impersonating helper. Latest day only.
 */
const BASE = "https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/46148D107";
const headers = {
  accept: "application/json, text/plain, */*",
  origin: "https://www.invesco.com",
  referer: "https://www.invesco.com/",
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
    const [p, d] = await impersonateFetch([
      { url: `${BASE}/prices?idType=cusip&variationType=priceListing&productType=ETF&productSubType=ETF-Non-40%20Act`, headers },
      { url: `${BASE}?expand=nav&idType=cusip&variationType=fundDetails&productType=ETF`, headers },
    ]);
    if (p.status !== 200) throw new Error(`QETH: prices endpoint ${p.status}`);
    const prices = JSON.parse(p.text) as { effectiveDate: string; nav: number; sharesOutstanding: number };
    const details = d.status === 200 ? (JSON.parse(d.text) as { shareclassTotalNetAssets?: number; shareclassTotalNetAssetsEffectiveDate?: string }) : null;
    const date = toDay(prices.effectiveDate);
    if (!date || !prices.sharesOutstanding || !prices.nav) throw new Error(`QETH: unexpected payload ${p.text.slice(0, 200)}`);
    const aum = details && details.shareclassTotalNetAssetsEffectiveDate === prices.effectiveDate ? details.shareclassTotalNetAssets : prices.nav * prices.sharesOutstanding;
    return [{ date, shares: prices.sharesOutstanding, nav: prices.nav, aum }];
  },
};
