import { fetchJson } from "../../http";
import { BROWSER_UA, FundAdapter, FundSnapshot, num, toDay } from "./types";

/**
 * iShares Ethereum Trust ETF (ETHA) and iShares Staked Ethereum Trust ETF (ETHB). The product page's
 * "fund download" is an XML Spreadsheet 2003 workbook whose Historical sheet lists NAV per share and
 * shares outstanding for every NAV date since inception; latest-holdings.csv adds the ether quantity
 * (staked + unstaked, published with a lag of a day or two).
 */
function fundDownloadUrl(portfolioId: string) {
  return `https://www.blackrock.com/varnish-api/blk-one01-product-data/product-data/api/v1/get-fund-document?appType=PRODUCT_PAGE&appSubType=ISHARES&targetSite=us-ishares&locale=en_US&portfolioId=${portfolioId}&component=fundDownload&userType=individual`;
}

async function text(url: string): Promise<string> {
  return fetchJson<string>(url, { headers: { "user-agent": BROWSER_UA } }, { retries: 3, timeoutMs: 60_000, parse: "text" });
}

function ishares(ticker: string, name: string, portfolioId: string, slug: string): FundAdapter {
  return {
    ticker,
    name,
    issuer: "BlackRock",
    method: "shares",
    history: true,
    sharesLag: 1,
    async fetch() {
      const xml = await text(fundDownloadUrl(portfolioId));
      const start = xml.indexOf('Name="Historical"');
      if (start < 0) throw new Error(`${ticker}: Historical sheet not found`);
      const end = xml.indexOf("</Worksheet>", start);
      const byDate = new Map<string, FundSnapshot>();
      for (const row of xml.slice(start, end).matchAll(/<(?:ss:)?Row[^>]*>([\s\S]*?)<\/(?:ss:)?Row>/g)) {
        const cells = [...row[1].matchAll(/<(?:ss:)?Data[^>]*>([\s\S]*?)<\/(?:ss:)?Data>/g)].map((m) => m[1]);
        if (cells.length !== 4) continue;
        const date = toDay(cells[0]);
        const nav = num(cells[1]);
        const shares = num(cells[3]);
        if (!date || nav === undefined || shares === undefined) continue;
        byDate.set(date, { date, nav, shares, aum: nav * shares });
      }
      if (byDate.size === 0) throw new Error(`${ticker}: no history rows parsed`);
      try {
        const csv = await text(`https://www.ishares.com/us/products/${portfolioId}/${slug}/latest-holdings.csv`);
        const asOf = csv.match(/Fund Holdings as of,"([^"]+)"/)?.[1];
        const day = asOf ? toDay(asOf) : undefined;
        let eth = 0;
        for (const m of csv.matchAll(/^"(?:S?ETH)","(?:STAKED )?ETHER"[^\n]*?,"([\d,.]+)","ETH"/gm)) eth += num(m[1]) ?? 0;
        if (day && eth > 0) byDate.set(day, { ...(byDate.get(day) ?? { date: day }), eth });
      } catch {
        // holdings file is optional
      }
      return [...byDate.values()];
    },
  };
}

export const etha = ishares("ETHA", "iShares Ethereum Trust ETF", "337614", "ishares-ethereum-trust-etf");
export const ethb = ishares("ETHB", "iShares Staked Ethereum Trust ETF", "348532", "ishares-staked-ethereum-trust-etf");
