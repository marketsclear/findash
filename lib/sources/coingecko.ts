import { fetchJson } from "../http";

/** Token valuations from CoinGecko's free API. HYPE = Hyperliquid, LIT = Lighter. */
const URL = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=hyperliquid,lighter";
const CACHE_MS = 60_000;

export interface TokenValuation {
  id: string;
  symbol: string;
  price: number;
  marketCap: number;
  fdv: number;
  circulatingSupply: number;
  totalSupply: number;
  updatedAt: string;
}

interface MarketRow {
  id: string;
  symbol: string;
  current_price: number;
  market_cap: number;
  fully_diluted_valuation: number;
  circulating_supply: number;
  total_supply: number;
  last_updated: string;
}

const g = globalThis as unknown as { __findashCg?: { at: number; data: Record<string, TokenValuation> } };

export async function fetchValuations(): Promise<Record<string, TokenValuation>> {
  if (g.__findashCg && Date.now() - g.__findashCg.at < CACHE_MS) return g.__findashCg.data;
  const rows = await fetchJson<MarketRow[]>(URL, {}, { retries: 1, timeoutMs: 8000 });
  const data: Record<string, TokenValuation> = {};
  for (const r of rows) {
    data[r.id] = {
      id: r.id,
      symbol: r.symbol.toUpperCase(),
      price: r.current_price,
      marketCap: r.market_cap,
      fdv: r.fully_diluted_valuation,
      circulatingSupply: r.circulating_supply,
      totalSupply: r.total_supply,
      updatedAt: r.last_updated,
    };
  }
  g.__findashCg = { at: Date.now(), data };
  return data;
}
