import { fetchJson } from "../http";
import { info, type SpotMeta } from "./hyperliquid";

/**
 * Token supply for LIT and HYPE from the chains and exchanges themselves. Collected on the DEX
 * schedule and stored, since supply moves slowly; the page reads the store.
 *
 * LIT (ERC-20 on Ethereum, 0x232c...4ee2):
 *  - Lighter burns repurchased LIT by sending it from its treasury to 0x...dEaD, so the contract's
 *    totalSupply() stays at 1,000,000,000. Total supply here = totalSupply() - balance of the burn
 *    address. Verified 10 Oct 2026: 18,090,720 LIT burned in two burns (10 Jul and 9 Oct 2026),
 *    which reconciles with Lighter's own buyback counter (18.31M bought = burned + 225K still in
 *    the treasury account, within 0.05%). The LIT on Robinhood Chain is bridged and not extra supply.
 *  - Lighter publishes no circulating-supply figure, so it is estimated from Lighter's own statements:
 *    250M distributed at launch (30 Dec 2025); 3.72M paid to stakers through 30 Jun 2026; staking
 *    funded from the ecosystem reserve at a fixed 6% APR since 1 Jul 2026 (Tokenomics Update,
 *    30 Jun 2026; docs.lighter.xyz "LIT Utility"). Burned and treasury-held LIT are subtracted.
 *    CoinGecko's 250M has not changed since launch and ignores both burns.
 *
 * HYPE: Hyperliquid's own token record (tokenDetails). totalSupply = max - burned (HyperEVM gas,
 * auction and priority-fee burns); circulatingSupply = total - future emissions - the named
 * non-circulating wallets, which include the Assistance Fund's buybacks (held, never sold). The
 * fund's holdings stay inside total supply here (strict max-minus-burned definition) and are
 * reported separately. CoinGecko's HYPE supply figures were a month stale on 10 Oct 2026.
 */
const LIT_CONTRACT = "0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2";
const BURN_ADDRESS = "0x000000000000000000000000000000000000dead";
const ASSISTANCE_FUND = "0xfefefefefefefefefefefefefefefefefefefefe";
const ETH_RPCS = ["https://ethereum-rpc.publicnode.com", "https://1rpc.io/eth", "https://cloudflare-eth.com", "https://eth.drpc.org"];
const LIGHTER_API = "https://mainnet.zklighter.elliot.ai/api/v1";

// Lighter's own statements, see the header comment.
const LIT_TGE_DISTRIBUTION = 250_000_000;
const LIT_STAKING_REWARDS_THROUGH_JUN_2026 = 3_720_000;
const LIT_STAKED_AT_JUN_30_2026 = 125_000_000;
const LIT_STAKING_APR = 0.06;
const LIT_ECOSYSTEM_STAKING_FROM = Date.parse("2026-07-01T00:00:00Z");

export interface SupplyStore {
  updatedAt: string;
  lit: {
    /** totalSupply() as the contract reports it (burns are transfers to 0x...dEaD, so this stays at 1B). */
    contractTotalSupply: number;
    burned: number;
    /** contractTotalSupply - burned. */
    totalSupply: number;
    /** Repurchased LIT sitting in Lighter's treasury account, not yet burned. */
    treasuryHeld: number;
    /** LIT in Lighter's staking pool. */
    staked: number;
    circulatingEstimate: number;
    circulatingBasis: { tge: number; rewardsThroughJun2026: number; rewardsSinceJul2026: number; apr: number; stakedAtJun30: number };
    block: number;
    rpc: string;
  };
  hype: {
    maxSupply: number;
    totalSupply: number;
    burned: number;
    circulatingSupply: number;
    futureEmissions: number;
    assistanceFund: number;
    nonCirculating: { address: string; balance: number }[];
  };
}

async function ethCall(rpc: string, to: string, data: string): Promise<bigint> {
  const res = await fetchJson<{ result?: string; error?: { message: string } }>(
    rpc,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }) },
    { retries: 1, timeoutMs: 20_000 },
  );
  if (!res.result || res.result === "0x") throw new Error(`eth_call failed: ${res.error?.message ?? "empty result"}`);
  return BigInt(res.result);
}

async function ethBlockNumber(rpc: string): Promise<number> {
  const res = await fetchJson<{ result: string }>(
    rpc,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }) },
    { retries: 1, timeoutMs: 20_000 },
  );
  return Number(BigInt(res.result));
}

/** LIT totalSupply() and the burn address balance, from the first RPC that answers. */
async function litOnChain(): Promise<{ contractTotalSupply: number; burned: number; block: number; rpc: string }> {
  const balanceOf = (addr: string) => "0x70a08231" + addr.slice(2).toLowerCase().padStart(64, "0");
  let lastErr: unknown;
  for (const rpc of ETH_RPCS) {
    try {
      const decimals = Number(await ethCall(rpc, LIT_CONTRACT, "0x313ce567"));
      if (decimals !== 18) throw new Error(`unexpected decimals ${decimals}`);
      const [total, burned, block] = await Promise.all([ethCall(rpc, LIT_CONTRACT, "0x18160ddd"), ethCall(rpc, LIT_CONTRACT, balanceOf(BURN_ADDRESS)), ethBlockNumber(rpc)]);
      const toNum = (v: bigint) => Number(v / BigInt("1000000000000")) / 1e6; // keep 6 decimals, avoid float overflow
      return { contractTotalSupply: toNum(total), burned: toNum(burned), block, rpc };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`LIT on-chain supply: every RPC failed (${(lastErr as Error)?.message ?? lastErr})`);
}

interface LighterAssets { assets?: { symbol: string; balance: string }[] }

async function litOnLighter(): Promise<{ treasuryHeld: number; staked: number }> {
  const headers = { "user-agent": "Mozilla/5.0", accept: "application/json" };
  const [acct, pools] = await Promise.all([
    fetchJson<{ accounts: LighterAssets[] }>(`${LIGHTER_API}/account?by=index&value=0`, { headers }),
    fetchJson<{ public_pools: LighterAssets[] }>(`${LIGHTER_API}/publicPoolsMetadata?filter=stake&index=281474976710655&limit=100`, { headers }),
  ]);
  const lit = (a: LighterAssets | undefined) => Number(a?.assets?.find((x) => x.symbol === "LIT")?.balance ?? 0);
  return { treasuryHeld: lit(acct.accounts?.[0]), staked: pools.public_pools.reduce((s, p) => s + lit(p), 0) };
}

async function hypeSupply(): Promise<SupplyStore["hype"]> {
  const meta = await info<SpotMeta>({ type: "spotMeta" });
  const hype = meta.tokens.find((t) => t.name === "HYPE");
  if (!hype) throw new Error("HYPE not found in spotMeta");
  const d = await info<{ maxSupply: string; totalSupply: string; circulatingSupply: string; futureEmissions?: string; nonCirculatingUserBalances?: [string, string][] }>({
    type: "tokenDetails",
    tokenId: hype.tokenId,
  });
  const nonCirculating = (d.nonCirculatingUserBalances ?? []).map(([address, balance]) => ({ address, balance: Number(balance) }));
  return {
    maxSupply: Number(d.maxSupply),
    totalSupply: Number(d.totalSupply),
    burned: Number(d.maxSupply) - Number(d.totalSupply),
    circulatingSupply: Number(d.circulatingSupply),
    futureEmissions: Number(d.futureEmissions ?? 0),
    assistanceFund: nonCirculating.find((n) => n.address.toLowerCase() === ASSISTANCE_FUND)?.balance ?? 0,
    nonCirculating,
  };
}

export async function collectSupply(log: (msg: string) => void = () => {}): Promise<SupplyStore> {
  const [chain, exchange, hype] = await Promise.all([litOnChain(), litOnLighter(), hypeSupply()]);
  const days = Math.max(0, (Date.now() - LIT_ECOSYSTEM_STAKING_FROM) / 86_400_000);
  const rewardsSinceJul2026 = LIT_STAKING_APR * ((LIT_STAKED_AT_JUN_30_2026 + exchange.staked) / 2) * (days / 365);
  const circulatingEstimate = LIT_TGE_DISTRIBUTION - chain.burned - exchange.treasuryHeld + LIT_STAKING_REWARDS_THROUGH_JUN_2026 + rewardsSinceJul2026;
  const store: SupplyStore = {
    updatedAt: new Date().toISOString(),
    lit: {
      ...chain,
      totalSupply: chain.contractTotalSupply - chain.burned,
      ...exchange,
      circulatingEstimate,
      circulatingBasis: { tge: LIT_TGE_DISTRIBUTION, rewardsThroughJun2026: LIT_STAKING_REWARDS_THROUGH_JUN_2026, rewardsSinceJul2026, apr: LIT_STAKING_APR, stakedAtJun30: LIT_STAKED_AT_JUN_30_2026 },
    },
    hype,
  };
  log(`supply: LIT ${(store.lit.totalSupply / 1e6).toFixed(2)}M total (${(chain.burned / 1e6).toFixed(2)}M burned, block ${chain.block}), ~${(circulatingEstimate / 1e6).toFixed(1)}M circulating; HYPE ${(hype.totalSupply / 1e6).toFixed(2)}M total, ${(hype.circulatingSupply / 1e6).toFixed(1)}M circulating, ${(hype.assistanceFund / 1e6).toFixed(1)}M in the Assistance Fund`);
  return store;
}
