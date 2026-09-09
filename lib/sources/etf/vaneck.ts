import { fetchJson } from "../../http";
import { BROWSER_UA, FundAdapter, num, toDay } from "./types";

/**
 * VanEck Ethereum ETF (ETHV). The holdings dataset behind the fund page returns the ether quantity and
 * its market value with an as-of date; the site needs its cookie-consent cookie to answer at all.
 * VanEck does not publish an exact share count, so flows are derived from the change in ether held.
 */
export const ethv: FundAdapter = {
  ticker: "ETHV",
  name: "VanEck Ethereum ETF",
  issuer: "VanEck",
  method: "eth",
  history: false,
  sharesLag: 1,
  lagUnverified: true,
  async fetch() {
    const data = await fetchJson<{ AsOfDate: string; Holdings: { HoldingName: string; Shares: string; MV: string; AsOfDate: string }[] }>(
      "https://www.vaneck.com/Main/HoldingsBlock/GetDataset/?blockId=348326&pageId=280216&ticker=ETHV",
      { headers: { "user-agent": BROWSER_UA, cookie: "vaneck_cookies=1", accept: "application/json" } },
    );
    const h = data.Holdings?.find((x) => /ether/i.test(x.HoldingName));
    const date = toDay(h?.AsOfDate ?? data.AsOfDate ?? "");
    const eth = num(h?.Shares), aum = num(h?.MV);
    if (!date || eth === undefined || aum === undefined) throw new Error(`ETHV: unexpected dataset ${JSON.stringify(data).slice(0, 200)}`);
    return [{ date, eth, aum }];
  },
};
