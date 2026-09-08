import { Day, dayFromMs } from "../days";
import { fetchJson } from "../http";

/**
 * DefiLlama dimension data (free endpoints only; perps volume sits behind their paid plan).
 *  - fees/<slug> dailyRevenue + dailyFees for both exchanges
 *  - dexs/hyperliquid dailyVolume = Hyperliquid spot orderbook volume
 *
 * Revenue definitions (DefiLlama methodology):
 *  - Hyperliquid: share of trading fees routed to the Assistance Fund (HYPE buybacks),
 *    excluding builder-code and HIP-3 deployer fees.
 *  - Lighter: maker/taker/transfer/withdraw fees kept by the protocol (perps, spot and
 *    Robinhood deployment), excluding liquidation fees that go to the LLP.
 */
const BASE = "https://api.llama.fi/summary";

export interface LlamaStore {
  updatedAt: string;
  hlRevenue: Record<Day, number>;
  hlFees: Record<Day, number>;
  hlSpotVolume: Record<Day, number>;
  lighterRevenue: Record<Day, number>;
  lighterFees: Record<Day, number>;
}

async function chart(kind: "fees" | "dexs", slug: string, dataType: string): Promise<Record<Day, number>> {
  const res = await fetchJson<{ totalDataChart: [number, number][] }>(`${BASE}/${kind}/${slug}?dataType=${dataType}`);
  const out: Record<Day, number> = {};
  for (const [ts, v] of res.totalDataChart ?? []) out[dayFromMs(ts * 1000)] = Number(v || 0);
  return out;
}

export async function collectDefiLlama(log: (msg: string) => void): Promise<LlamaStore> {
  const [hlRevenue, hlFees, hlSpotVolume, lighterRevenue, lighterFees] = await Promise.all([
    chart("fees", "hyperliquid", "dailyRevenue"),
    chart("fees", "hyperliquid", "dailyFees"),
    chart("dexs", "hyperliquid", "dailyVolume"),
    chart("fees", "lighter", "dailyRevenue"),
    chart("fees", "lighter", "dailyFees"),
  ]);
  log(`defillama: hl revenue ${Object.keys(hlRevenue).length} days, lighter revenue ${Object.keys(lighterRevenue).length} days`);
  return { updatedAt: new Date().toISOString(), hlRevenue, hlFees, hlSpotVolume, lighterRevenue, lighterFees };
}
