import { fetchJson } from "../../http";
import { BROWSER_UA, FundAdapter, FundSnapshot, num, toDay } from "./types";
import { readXlsxSheet } from "./xlsx";

/**
 * Grayscale Ethereum Staking ETF (ETHE) and Ethereum Staking Mini ETF (ETH). Their ETF pages block
 * non-browser clients, but each links a "product performance" workbook on S3 (keyed by the product's
 * UUID) with the full daily history of shares outstanding, NAV and AUM, plus an ether-per-share sheet.
 */
const S3 = "https://reporting-prod-20231113144948145500000003.s3.us-east-1.amazonaws.com/product-performance";

function grayscale(ticker: string, name: string, productId: string): FundAdapter {
  return {
    ticker,
    name,
    issuer: "Grayscale",
    method: "shares",
    history: true,
    sharesLag: 1,
    async fetch() {
      const buf = await fetchJson<Uint8Array>(`${S3}/${productId}.xlsx`, { headers: { "user-agent": BROWSER_UA } }, { retries: 3, parse: "bytes" });
      const rows = readXlsxSheet(buf, 1);
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const col = (label: string) => header.findIndex((h) => h === label.toLowerCase());
      const iDate = col("Date"), iShares = col("Shares Outstanding"), iNav = col("NAV Per Share"), iAum = col("AUM");
      if (iDate < 0 || iShares < 0 || iNav < 0) throw new Error(`${ticker}: unexpected sheet header ${JSON.stringify(rows[0])}`);
      const out: FundSnapshot[] = [];
      for (const r of rows.slice(1)) {
        const date = toDay(r[iDate] ?? "");
        const shares = num(r[iShares]), nav = num(r[iNav]);
        if (!date || shares === undefined || nav === undefined) continue;
        out.push({ date, shares, nav, aum: iAum >= 0 ? num(r[iAum]) : undefined });
      }
      if (out.length === 0) throw new Error(`${ticker}: no rows parsed`);
      // Holdings sheet: ether per share for the latest date.
      try {
        const hold = readXlsxSheet(buf, 3);
        const h = hold[0].map((x) => x.trim().toLowerCase());
        const iD = h.indexOf("date"), iA = h.findIndex((x) => x.startsWith("asset"));
        for (const r of hold.slice(1)) {
          const date = toDay(r[iD] ?? "");
          const perShare = num(r[iA]);
          const snap = out.find((s) => s.date === date);
          if (snap && perShare !== undefined && snap.shares) snap.eth = perShare * snap.shares;
        }
      } catch {
        // optional
      }
      return out;
    },
  };
}

export const ethe = grayscale("ETHE", "Grayscale Ethereum Staking ETF", "585fdb73-c55c-40cd-bb35-e1b532d72e70");
export const ethMini = grayscale("ETH", "Grayscale Ethereum Staking Mini ETF", "52edbb6f-93e8-4b73-85f6-6b347706bc2a");
