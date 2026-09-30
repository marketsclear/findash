import { fetchJson } from "../http";
import { hypeTokenDetails } from "./hyperliquid";
import { litPriceOnLighter } from "./lighter";

/**
 * Token valuations, first-party where the exchanges publish the data:
 *  - HYPE: price and supply from Hyperliquid's own token details (live; includes the HYPE the
 *    Assistance Fund holds, which Hyperliquid counts in total and circulating supply).
 *  - LIT: price from Lighter's LIT/USDC spot market. Lighter publishes no supply endpoint, so LIT's
 *    total and circulating supply come from CoinGecko (1B total, 250M unlocked as of Sep 2026).
 */
const CACHE_MS = 60_000;
const CG_LIT = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=lighter";

export interface TokenValuation {
  id: string;
  symbol: string;
  price: number;
  marketCap: number;
  fdv: number;
  circulatingSupply: number;
  totalSupply: number;
  updatedAt: string;
  /** Where price and supply came from, for the page footnote. */
  priceSource: string;
  supplySource: string;
}

const g = globalThis as unknown as { __findashVal?: { at: number; data: Record<string, TokenValuation> } };

export async function fetchValuations(): Promise<Record<string, TokenValuation>> {
  if (g.__findashVal && Date.now() - g.__findashVal.at < CACHE_MS) return g.__findashVal.data;
  const [hype, litPrice, cg] = await Promise.all([
    hypeTokenDetails(),
    litPriceOnLighter(),
    fetchJson<{ circulating_supply: number; total_supply: number }[]>(CG_LIT, {}, { retries: 1, timeoutMs: 8000 }),
  ]);
  const lit = cg[0];
  if (!lit?.total_supply || !lit.circulating_supply) throw new Error("CoinGecko: LIT supply missing");
  const now = new Date().toISOString();
  const data: Record<string, TokenValuation> = {
    hyperliquid: {
      id: "hyperliquid",
      symbol: "HYPE",
      price: hype.price,
      marketCap: hype.price * hype.circulatingSupply,
      fdv: hype.price * hype.totalSupply,
      circulatingSupply: hype.circulatingSupply,
      totalSupply: hype.totalSupply,
      updatedAt: now,
      priceSource: "Hyperliquid spot",
      supplySource: "Hyperliquid",
    },
    lighter: {
      id: "lighter",
      symbol: "LIT",
      price: litPrice,
      marketCap: litPrice * lit.circulating_supply,
      fdv: litPrice * lit.total_supply,
      circulatingSupply: lit.circulating_supply,
      totalSupply: lit.total_supply,
      updatedAt: now,
      priceSource: "Lighter LIT/USDC",
      supplySource: "CoinGecko",
    },
  };
  g.__findashVal = { at: Date.now(), data };
  return data;
}
