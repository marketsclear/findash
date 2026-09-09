import { impersonateFetch } from "./impersonate";
import { FundAdapter, num, toDay } from "./types";

/**
 * Fidelity Ethereum Fund (FETH). The institutional research page's quote API returns the exact share
 * count (short.freeFloatShares), previous-day NAV and ether held. Akamai in front of it rejects
 * non-browser TLS fingerprints, and the API also requires the app's CSRF token as a header, so the
 * sequence (page → tokens → quote) runs through the impersonating helper with a shared cookie jar.
 */
interface Quote {
  quoteData?: {
    short?: { freeFloatShares?: string };
    navPreviousDay?: { value?: number; asOfDate?: string };
    cryptoDetails?: { totalUnitPerCoin?: number; asOfDate?: string };
  };
}

const PAGE = "https://institutional.fidelity.com/prgw/digital/research/quote/dashboard/summary?symbol=FETH";
const API = "https://institutional.fidelity.com/prgw/digital/research/api";

export const feth: FundAdapter = {
  ticker: "FETH",
  name: "Fidelity Ethereum Fund",
  issuer: "Fidelity",
  method: "shares",
  history: false,
  sharesLag: 1,
  lagUnverified: true,
  async fetch() {
    const [, tokens, quote] = await impersonateFetch([
      { url: PAGE },
      { url: `${API}/tokens`, headers: { referer: PAGE, accept: "application/json" } },
      {
        url: `${API}/quote`,
        method: "POST",
        json: { symbol: "FETH" },
        headers: {
          referer: PAGE,
          origin: "https://institutional.fidelity.com",
          accept: "application/json, text/plain, */*",
          "content-type": "application/json",
          "x-csrf-token": { $json: "1.csrfToken" },
        },
      },
    ]);
    if (tokens.status !== 200) throw new Error(`FETH: tokens endpoint ${tokens.status}`);
    if (quote.status !== 200) throw new Error(`FETH: quote endpoint ${quote.status}`);
    const q = (JSON.parse(quote.text) as Quote).quoteData;
    if (!q) throw new Error(`FETH: no quoteData in ${quote.text.slice(0, 120)}`);
    const shares = num(q.short?.freeFloatShares);
    const nav = q.navPreviousDay?.value;
    const date = q.navPreviousDay?.asOfDate ? toDay(q.navPreviousDay.asOfDate) : undefined;
    if (!date || shares === undefined || nav === undefined) throw new Error(`FETH: incomplete quote ${JSON.stringify(q).slice(0, 200)}`);
    const ethDate = q.cryptoDetails?.asOfDate ? toDay(q.cryptoDetails.asOfDate) : undefined;
    const eth = ethDate === date ? q.cryptoDetails?.totalUnitPerCoin : undefined;
    return [{ date, shares, nav, aum: nav * shares, eth }];
  },
};
