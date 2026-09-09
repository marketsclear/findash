import { addDays, Day, eachDay, todayUtc } from "./days";
import { getRefreshState, startRefresh } from "./collect";
import { DailySeries, makeSeries, sumSeries, Window, windowsEnding, windowStat, WindowStat, WindowKey } from "./metrics";
import { LlamaStore } from "./sources/defillama";
import { HlStore, liveHyperliquid24h } from "./sources/hyperliquid";
import { LighterStore, liveLighter24h } from "./sources/lighter";
import { fetchValuations, TokenValuation } from "./sources/coingecko";
import { readStore } from "./store";
import type { EtfStore } from "./sources/etf";
import { flowTable, flowWindows, latestCompleteDay, latestSnapshots, type EtfFlowTable, type FlowWindow } from "./etf-flows";
import type { FundSnapshot } from "./sources/etf/types";

const STALE_MS = 60 * 60 * 1000;

export interface MetricBlock {
  /** Daily values for charting, oldest first, ending on the last complete day. */
  points: { day: Day; value: number }[];
  windows: Record<WindowKey, WindowStat>;
  /** Named sub-series (perps / hip3 / spot ...) so the breakdown is visible in the table view. */
  segments: { name: string; days: Record<Day, number> }[];
}

export interface ExchangeData {
  id: "hyperliquid" | "lighter";
  name: string;
  volume: MetricBlock;
  revenue: MetricBlock;
  live24h: { volume: number | null; parts: { name: string; value: number }[] };
  updatedAt: string | null;
}

export interface RatioStat {
  /** Lighter as a percentage of Hyperliquid over the window. */
  pct: number | null;
  prevPct: number | null;
  /** Change versus the preceding window, in percentage points. */
  deltaPp: number | null;
  partial: boolean;
}

export interface RatioData {
  volume: { points: { day: Day; value: number }[]; windows: Record<WindowKey, RatioStat> };
  revenue: { points: { day: Day; value: number }[]; windows: Record<WindowKey, RatioStat> };
}

export interface ValuationData {
  hype: TokenValuation;
  lit: TokenValuation;
  /** LIT fully diluted valuation as a percentage of HYPE's. */
  fdvPct: number;
  /** LIT circulating market cap as a percentage of HYPE's. */
  marketCapPct: number;
}

/** "inprocess": the web server refreshes data itself (local). "external": a scheduled job does (production). */
export function refreshMode(): "inprocess" | "external" {
  return process.env.FINDASH_REFRESH === "external" ? "external" : "inprocess";
}

export interface EtfData {
  tickers: string[];
  table: EtfFlowTable;
  windows: FlowWindow[];
  funds: Record<string, { name: string; issuer: string; method: "shares" | "eth"; latest: FundSnapshot | null; lastError?: string }>;
  /** Daily total net flow, oldest first, for the chart. */
  chart: { day: Day; value: number; detail?: string }[];
  /** Newest day with a reasonably complete set of funds (see latestCompleteDay). */
  latestDay: Day | null;
  updatedAt: string | null;
}

export const ETF_TICKERS = ["ETHA", "ETHB", "FETH", "ETHW", "TETH", "ETHV", "QETH", "EZET", "ETHE", "ETH"];

export function buildEtfData(store: EtfStore | null): EtfData {
  const empty: EtfStore = { updatedAt: "", funds: {} };
  const s = store ?? empty;
  const table = flowTable(s, ETF_TICKERS, 400);
  const latest = latestSnapshots(s, ETF_TICKERS);
  const funds = Object.fromEntries(
    ETF_TICKERS.map((t) => [t, { name: s.funds[t]?.name ?? t, issuer: s.funds[t]?.issuer ?? "", method: s.funds[t]?.method ?? "shares", latest: latest[t], lastError: s.funds[t]?.lastError }]),
  );
  const chart = [...table.rows].reverse().slice(-120).map((r) => ({ day: r.date, value: r.total, detail: r.reporting < ETF_TICKERS.length ? `${r.reporting} of ${ETF_TICKERS.length} funds reported` : undefined }));
  return { tickers: ETF_TICKERS, table: { tickers: table.tickers, rows: table.rows.slice(0, 20) }, windows: flowWindows(table), funds, chart, latestDay: latestCompleteDay(table), updatedAt: store?.updatedAt ?? null };
}

export interface DashboardData {
  generatedAt: string;
  /** Last complete UTC day; every window ends here. */
  asOf: Day;
  windows: Window[];
  exchanges: ExchangeData[];
  /** Lighter relative to Hyperliquid. */
  ratio: RatioData;
  /** Live token valuations (CoinGecko); null when the lookup failed. */
  valuation: ValuationData | null;
  etf: EtfData;
  refresh: ReturnType<typeof getRefreshState>;
  refreshMode: "inprocess" | "external";
  hasData: boolean;
}

function block(segments: { name: string; days: Record<Day, number> }[], windows: Window[], asOf: Day, chartFrom: Day): MetricBlock {
  const total = segments.length ? sumSeries(segments[0].days, ...segments.slice(1).map((s) => s.days)) : {};
  const series: DailySeries = makeSeries(total);
  const stats = Object.fromEntries(windows.map((w) => [w.key, windowStat(series, w)])) as Record<WindowKey, WindowStat>;
  const from = series.firstDay && series.firstDay > chartFrom ? series.firstDay : chartFrom;
  const through = series.lastDay && series.lastDay < asOf ? series.lastDay : asOf;
  const points = series.firstDay ? eachDay(from, through).map((day) => ({ day, value: total[day] ?? 0 })) : [];
  return { points, windows: stats, segments };
}

function pick<T>(days: Record<Day, T> | undefined, key: keyof T): Record<Day, number> {
  const out: Record<Day, number> = {};
  for (const [day, row] of Object.entries(days ?? {})) out[day] = Number(row[key] ?? 0);
  return out;
}

function ratioStat(num: WindowStat, den: WindowStat): RatioStat {
  const pct = num.value !== null && den.value !== null && den.value > 0 ? (num.value / den.value) * 100 : null;
  const prevPct = num.prev !== null && den.prev !== null && den.prev > 0 ? (num.prev / den.prev) * 100 : null;
  return { pct, prevPct, deltaPp: pct !== null && prevPct !== null ? pct - prevPct : null, partial: num.partial || den.partial };
}

function ratioBlock(num: MetricBlock, den: MetricBlock, windows: Window[]) {
  const denByDay = new Map(den.points.map((p) => [p.day, p.value]));
  const points = num.points
    .filter((p) => (denByDay.get(p.day) ?? 0) > 0)
    .map((p) => ({ day: p.day, value: (p.value / denByDay.get(p.day)!) * 100 }));
  const stats = Object.fromEntries(windows.map((w) => [w.key, ratioStat(num.windows[w.key], den.windows[w.key])])) as Record<WindowKey, RatioStat>;
  return { points, windows: stats };
}

// Last successful live lookups, so a slow or throttled upstream (typically while a refresh is
// consuming the Hyperliquid rate budget) degrades to a slightly stale figure instead of a blank.
const lastGood = (globalThis as unknown as { __findashLive?: Map<string, unknown> }).__findashLive ??= new Map<string, unknown>();
(globalThis as unknown as { __findashLive?: Map<string, unknown> }).__findashLive = lastGood;

async function safe<T>(key: string, p: Promise<T>, timeoutMs = 8000): Promise<T | null> {
  try {
    const value = await Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))]);
    lastGood.set(key, value);
    return value;
  } catch {
    return (lastGood.get(key) as T | undefined) ?? null;
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const [hl, lighter, llama, etfStore] = await Promise.all([
    readStore<HlStore>("hyperliquid"),
    readStore<LighterStore>("lighter"),
    readStore<LlamaStore>("defillama"),
    readStore<EtfStore>("etf-eth"),
  ]);

  const newest = Math.max(...[hl, lighter, llama].map((s) => (s ? Date.parse(s.updatedAt) : 0)));
  if (refreshMode() === "inprocess" && process.env.FINDASH_AUTO_REFRESH !== "0" && Date.now() - newest > STALE_MS && !getRefreshState().running) {
    void startRefresh();
  }

  const today = todayUtc();
  const asOf = addDays(today, -1);
  const windows = windowsEnding(asOf);
  const chartFrom = addDays(asOf, -729);

  const [liveHl, liveLighter, tokens] = await Promise.all([safe("hl24h", liveHyperliquid24h(), 12_000), safe("lighter24h", liveLighter24h()), safe("valuations", fetchValuations())]);
  const hype = tokens?.hyperliquid;
  const lit = tokens?.lighter;
  const valuation: ValuationData | null =
    hype && lit && hype.fdv > 0 && hype.marketCap > 0
      ? { hype, lit, fdvPct: (lit.fdv / hype.fdv) * 100, marketCapPct: (lit.marketCap / hype.marketCap) * 100 }
      : null;

  const exchanges: ExchangeData[] = [
    {
      id: "hyperliquid",
      name: "Hyperliquid",
      volume: block(
        [
          { name: "Perps", days: pick(hl?.days, "perps") },
          { name: "HIP-3 perps", days: pick(hl?.days, "hip3") },
          { name: "Spot", days: llama?.hlSpotVolume ?? {} },
        ],
        windows, asOf, chartFrom,
      ),
      revenue: block([{ name: "Revenue", days: llama?.hlRevenue ?? {} }], windows, asOf, chartFrom),
      live24h: liveHl
        ? { volume: liveHl.perps + liveHl.hip3 + liveHl.spot, parts: [{ name: "Perps", value: liveHl.perps }, { name: "HIP-3", value: liveHl.hip3 }, { name: "Spot", value: liveHl.spot }] }
        : { volume: null, parts: [] },
      updatedAt: hl?.updatedAt ?? null,
    },
    {
      id: "lighter",
      name: "Lighter",
      volume: block(
        [
          { name: "Perps", days: pick(lighter?.days, "perps") },
          { name: "Spot", days: pick(lighter?.days, "spot") },
          { name: "Robinhood", days: pick(lighter?.days, "robinhood") },
        ],
        windows, asOf, chartFrom,
      ),
      revenue: block([{ name: "Revenue", days: llama?.lighterRevenue ?? {} }], windows, asOf, chartFrom),
      live24h: liveLighter
        ? { volume: liveLighter.main + liveLighter.robinhood, parts: [{ name: "Lighter", value: liveLighter.main }, { name: "Robinhood", value: liveLighter.robinhood }] }
        : { volume: null, parts: [] },
      updatedAt: lighter?.updatedAt ?? null,
    },
  ];

  const [hlData, lighterData] = exchanges;
  const ratio: RatioData = {
    volume: ratioBlock(lighterData.volume, hlData.volume, windows),
    revenue: ratioBlock(lighterData.revenue, hlData.revenue, windows),
  };

  return {
    generatedAt: new Date().toISOString(),
    asOf,
    windows,
    exchanges,
    ratio,
    valuation,
    etf: buildEtfData(etfStore),
    refresh: getRefreshState(),
    refreshMode: refreshMode(),
    hasData: !!(hl && lighter && llama),
  };
}
