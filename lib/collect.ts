import { readStore, writeStore } from "./store";
import { collectDefiLlama, LlamaStore } from "./sources/defillama";
import { collectHyperliquid, HlStore } from "./sources/hyperliquid";
import { collectLighter, LighterStore } from "./sources/lighter";
import { collectEtf, EtfStore } from "./sources/etf";

export interface RefreshState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  log: string[];
}

type Slot = { state: RefreshState; promise: Promise<void> | null };
// Kept on globalThis so dev-server HMR and route handlers share one refresh at a time.
const g = globalThis as unknown as { __findashRefresh?: Slot };
const slot: Slot = (g.__findashRefresh ??= {
  state: { running: false, startedAt: null, finishedAt: null, error: null, log: [] },
  promise: null,
});

export function getRefreshState(): RefreshState {
  return slot.state;
}

/** Refresh every collector. Concurrent callers share the in-flight run. */
export function startRefresh(logger: (msg: string) => void = () => {}, scope: "dex" | "etf" | "all" = "dex"): Promise<void> {
  if (slot.promise) return slot.promise;
  const state = slot.state;
  state.running = true;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.error = null;
  state.log = [];
  const log = (msg: string) => {
    state.log.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
    if (state.log.length > 200) state.log.shift();
    logger(msg);
  };
  slot.promise = (async () => {
    const jobs: Promise<void>[] = [];
    if (scope !== "etf") {
      jobs.push(
        readStore<HlStore>("hyperliquid").then((prev) => collectHyperliquid(prev, log)).then((s) => writeStore("hyperliquid", s)),
        readStore<LighterStore>("lighter").then((prev) => collectLighter(prev, log)).then((s) => writeStore("lighter", s)),
        collectDefiLlama(log).then((s: LlamaStore) => writeStore("defillama", s)),
      );
    }
    if (scope !== "dex") {
      jobs.push(readStore<EtfStore>("etf-eth").then((prev) => collectEtf(prev, log)).then((s) => writeStore("etf-eth", s)));
    }
    const results = await Promise.allSettled(jobs);
    const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => String(r.reason?.message ?? r.reason));
    for (const e of errors) log(`error: ${e}`);
    state.error = errors.length ? errors.join("; ") : null;
    state.running = false;
    state.finishedAt = new Date().toISOString();
    slot.promise = null;
  })();
  return slot.promise;
}
