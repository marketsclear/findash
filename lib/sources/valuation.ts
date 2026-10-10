import { hypeTokenDetails } from "./hyperliquid";
import { litPriceOnLighter } from "./lighter";
import type { SupplyStore } from "./supply";

/**
 * Token valuations: live prices from the exchanges (HYPE mid on Hyperliquid spot, LIT last trade on
 * Lighter's LIT/USDC market) applied to the stored supply figures (see supply.ts for their sources).
 * No third-party data.
 */
const CACHE_MS = 60_000;

export interface TokenValuation {
  id: string;
  symbol: string;
  price: number;
  marketCap: number;
  fdv: number;
  circulatingSupply: number;
  totalSupply: number;
  /** Tokens permanently removed (subtracted from totalSupply). */
  burned: number;
  /** Repurchased tokens the protocol holds without burning (inside totalSupply, outside circulating). */
  heldByProtocol: number;
  circulatingIsEstimate: boolean;
  updatedAt: string;
  supplyAsOf: string;
  priceSource: string;
  supplySource: string;
}

const g = globalThis as unknown as { __findashVal?: { at: number; data: Record<string, TokenValuation> } };

export async function fetchValuations(supply: SupplyStore): Promise<Record<string, TokenValuation>> {
  if (g.__findashVal && Date.now() - g.__findashVal.at < CACHE_MS) return g.__findashVal.data;
  const [hype, litPrice] = await Promise.all([hypeTokenDetails(), litPriceOnLighter()]);
  const now = new Date().toISOString();
  const { lit, hype: h } = supply;
  const data: Record<string, TokenValuation> = {
    hyperliquid: {
      id: "hyperliquid",
      symbol: "HYPE",
      price: hype.price,
      marketCap: hype.price * h.circulatingSupply,
      fdv: hype.price * h.totalSupply,
      circulatingSupply: h.circulatingSupply,
      totalSupply: h.totalSupply,
      burned: h.burned,
      heldByProtocol: h.assistanceFund,
      circulatingIsEstimate: false,
      updatedAt: now,
      supplyAsOf: supply.updatedAt,
      priceSource: "Hyperliquid spot",
      supplySource: "Hyperliquid token record",
    },
    lighter: {
      id: "lighter",
      symbol: "LIT",
      price: litPrice,
      marketCap: litPrice * lit.circulatingEstimate,
      fdv: litPrice * lit.totalSupply,
      circulatingSupply: lit.circulatingEstimate,
      totalSupply: lit.totalSupply,
      burned: lit.burned,
      heldByProtocol: lit.treasuryHeld,
      circulatingIsEstimate: true,
      updatedAt: now,
      supplyAsOf: supply.updatedAt,
      priceSource: "Lighter LIT/USDC",
      supplySource: "Ethereum contract, net of burns",
    },
  };
  g.__findashVal = { at: Date.now(), data };
  return data;
}
