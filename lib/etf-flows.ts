import { addDays, Day } from "./days";
import type { EtfFundStore, EtfStore } from "./sources/etf";
import type { FundSnapshot } from "./sources/etf/types";

/**
 * Daily net flows per fund, derived from consecutive issuer snapshots:
 *   shares method: (shares_t − shares_prev) × NAV_t
 *   eth method:    (eth_t − eth_prev) × (AUM_t / eth_t)   (funds that publish no share count)
 * With sharesLag = 1 the count published on NAV date t reflects orders placed on the previous NAV
 * date, so the change is attributed to that earlier date and valued at its NAV; with sharesLag = 0 it is
 * attributed to t. The gap between snapshots is normally one trading day but can be longer around
 * holidays or missed collections.
 */
export interface FundFlow {
  date: Day;
  usd: number;
  /** Date of the previous snapshot the change was measured against. */
  from: Day;
  nav?: number;
  shares?: number;
  eth?: number;
  aum?: number;
  /** True when the value comes from the fund's secondary seed rather than issuer data. */
  seeded?: boolean;
}

export function fundFlows(fund: EtfFundStore): FundFlow[] {
  const derived = derivedFlows(fund);
  if (!fund.seed) return derived;
  const firstPrimary = derived[0]?.date;
  const seeded: FundFlow[] = Object.entries(fund.seed.flows)
    .filter(([d]) => !firstPrimary || d < firstPrimary)
    .map(([date, usd]) => ({ date, usd, from: date, seeded: true }));
  return [...seeded, ...derived].sort((a, b) => a.date.localeCompare(b.date));
}

function derivedFlows(fund: EtfFundStore): FundFlow[] {
  const days = Object.keys(fund.days).sort();
  const out: FundFlow[] = [];
  let prev: FundSnapshot | null = null;
  for (const d of days) {
    const s = fund.days[d];
    const usable = fund.method === "shares" ? s.shares !== undefined && s.nav !== undefined : s.eth !== undefined && s.aum !== undefined;
    if (!usable) continue;
    if (prev) {
      const lagged = (fund.sharesLag ?? 0) === 1;
      const at = lagged ? prev : s; // snapshot whose date and NAV the flow belongs to
      let usd: number;
      if (fund.method === "shares") usd = (s.shares! - prev.shares!) * at.nav!;
      else usd = (s.eth! - prev.eth!) * (at.aum! / at.eth!);
      out.push({ date: at.date, usd, from: lagged ? s.date : prev.date, nav: at.nav, shares: at.shares, eth: at.eth, aum: at.aum });
    }
    prev = s;
  }
  return out;
}

export interface EtfFlowTable {
  tickers: string[];
  /** Trading days, newest first. */
  rows: { date: Day; byFund: Record<string, number | null>; seeded: Record<string, boolean>; total: number; reporting: number }[];
}

export function flowTable(store: EtfStore, tickers: string[], days: number): EtfFlowTable {
  const perFund: Record<string, Map<Day, FundFlow>> = {};
  const dates = new Set<Day>();
  for (const t of tickers) {
    const fund = store.funds[t];
    perFund[t] = new Map();
    if (!fund) continue;
    for (const f of fundFlows(fund)) {
      perFund[t].set(f.date, f);
      dates.add(f.date);
    }
  }
  const rows = [...dates].sort().reverse().slice(0, days).map((date) => {
    const byFund: Record<string, number | null> = {};
    const seeded: Record<string, boolean> = {};
    let total = 0, reporting = 0;
    for (const t of tickers) {
      const f = perFund[t].get(date);
      byFund[t] = f ? f.usd : null;
      seeded[t] = !!f?.seeded;
      if (f) { total += f.usd; reporting++; }
    }
    return { date, byFund, seeded, total, reporting };
  });
  return { tickers, rows };
}

export interface FlowWindow {
  key: "daily" | "weekly" | "monthly" | "ytd" | "yearly";
  label: string;
  start: Day;
  end: Day;
  usd: number;
  /** Number of trading days with any data in the window. */
  days: number;
}

/**
 * The most recent day for which the table is reasonably complete: at least half of the funds that
 * report at all have a value. Issuers with a one-day share-count lag only fill a day once the next
 * NAV is published, so the newest row is often just the same-day issuers.
 */
export function latestCompleteDay(table: EtfFlowTable): Day | null {
  const active = new Set<string>();
  for (const r of table.rows) for (const [t, v] of Object.entries(r.byFund)) if (v !== null) active.add(t);
  const need = Math.max(1, Math.ceil(active.size / 2));
  return table.rows.find((r) => r.reporting >= need)?.date ?? table.rows[0]?.date ?? null;
}

/** Sum of total daily flows over calendar windows ending on the latest reasonably complete day. */
export function flowWindows(table: EtfFlowTable): FlowWindow[] {
  const latest = latestCompleteDay(table);
  if (!latest) return [];
  const sumFrom = (start: Day) => {
    let usd = 0, days = 0;
    for (const r of table.rows) if (r.date >= start && r.date <= latest) { usd += r.total; days++; }
    return { usd, days };
  };
  const defs: [FlowWindow["key"], string, Day][] = [
    ["daily", "Daily", latest],
    ["weekly", "Weekly", addDays(latest, -6)],
    ["monthly", "Monthly", addDays(latest, -29)],
    ["ytd", "Year to date", `${latest.slice(0, 4)}-01-01`],
    ["yearly", "Yearly", addDays(latest, -364)],
  ];
  return defs.map(([key, label, start]) => ({ key, label, start, end: latest, ...sumFrom(start) }));
}

/** Latest snapshot per fund, for the AUM / holdings summary. */
export function latestSnapshots(store: EtfStore, tickers: string[]): Record<string, (FundSnapshot & { ticker: string }) | null> {
  const out: Record<string, (FundSnapshot & { ticker: string }) | null> = {};
  for (const t of tickers) {
    const fund = store.funds[t];
    const day = fund ? Object.keys(fund.days).sort().pop() : undefined;
    out[t] = fund && day ? { ticker: t, ...fund.days[day] } : null;
  }
  return out;
}
