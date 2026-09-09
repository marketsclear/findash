import type { Day } from "../../days";

/** One issuer-published data point for a fund on a given NAV date. */
export interface FundSnapshot {
  date: Day;
  /** Shares outstanding (exact, as published). */
  shares?: number;
  /** NAV per share in USD. */
  nav?: number;
  /** Ether held by the fund. */
  eth?: number;
  /** Ether per share, when the issuer publishes it (lets a flow be priced without a same-day AUM). */
  ethPerShare?: number;
  /** Net assets in USD. */
  aum?: number;
}

export interface FundAdapter {
  ticker: string;
  name: string;
  issuer: string;
  /** How daily flow is derived: change in shares × NAV, or change in ether held × implied price. */
  method: "shares" | "eth";
  /** Whether the issuer publishes a downloadable history (else only the latest day). */
  history: boolean;
  /** Needs a headless browser (bot-protected or JS-rendered). */
  browser?: boolean;
  /**
   * Trading days between a creation/redemption and its appearance in the published share count.
   * 1 = the count published for NAV date t reflects orders from the previous trading day (iShares,
   * Grayscale - verified against third-party flow tables); 0 = same day (21Shares - verified).
   * Flows are attributed to the order date and valued at that date's NAV.
   */
  sharesLag: 0 | 1;
  /** True when the lag has not yet been confirmed against an independent source. */
  lagUnverified?: boolean;
  fetch(): Promise<FundSnapshot[]>;
}

export const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export function num(s: string | number | null | undefined): number | undefined {
  if (s === null || s === undefined) return undefined;
  if (typeof s === "number") return Number.isFinite(s) ? s : undefined;
  const v = Number(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(v) ? v : undefined;
}

/** "09/08/2026" | "Sep 08, 2026" | "2026-09-08" | "2026-09-08T00:00:00" → "2026-09-08" */
export function toDay(s: string): Day | undefined {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  m = t.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/);
  if (m) {
    const mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1].toLowerCase());
    if (mon >= 0) return `${m[3]}-${String(mon + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  m = t.match(/^([A-Za-z]{3})-(\d{2})-(\d{4})$/); // Sep-04-2026
  if (m) {
    const mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1].toLowerCase());
    if (mon >= 0) return `${m[3]}-${String(mon + 1).padStart(2, "0")}-${m[2]}`;
  }
  return undefined;
}
