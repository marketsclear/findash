import type { Day } from "../../days";
export { closeBrowser } from "./browser";
import { ADAPTERS } from "./registry";
import { closeBrowser } from "./browser";
import type { FundSnapshot } from "./types";

export interface EtfFundStore {
  name: string;
  issuer: string;
  method: "shares" | "eth";
  history: boolean;
  sharesLag: 0 | 1;
  lagUnverified?: boolean;
  days: Record<Day, FundSnapshot>;
  lastOk?: string;
  lastError?: string;
}

export interface EtfStore {
  updatedAt: string;
  funds: Record<string, EtfFundStore>;
}

/** Fetch every fund; a failing issuer keeps its previous rows and records the error. */
export async function collectEtf(existing: EtfStore | null, log: (msg: string) => void): Promise<EtfStore> {
  const funds: Record<string, EtfFundStore> = { ...(existing?.funds ?? {}) };
  try {
    for (const a of ADAPTERS) {
      const prev = funds[a.ticker];
      const fund: EtfFundStore = { name: a.name, issuer: a.issuer, method: a.method, history: a.history, sharesLag: a.sharesLag, lagUnverified: a.lagUnverified, days: { ...(prev?.days ?? {}) }, lastOk: prev?.lastOk, lastError: prev?.lastError };
      try {
        const snaps = await a.fetch();
        for (const s of snaps) fund.days[s.date] = { ...(fund.days[s.date] ?? {}), ...stripUndefined(s) };
        fund.lastOk = new Date().toISOString();
        fund.lastError = undefined;
        const latest = snaps.map((s) => s.date).sort().pop();
        log(`etf ${a.ticker}: ${snaps.length} rows, latest ${latest}`);
      } catch (err) {
        fund.lastError = `${new Date().toISOString().slice(0, 16)} ${(err as Error).message}`;
        log(`etf ${a.ticker}: FAILED ${(err as Error).message}`);
      }
      funds[a.ticker] = fund;
    }
  } finally {
    await closeBrowser();
  }
  return { updatedAt: new Date().toISOString(), funds };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
