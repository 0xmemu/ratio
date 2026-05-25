/**
 * @package market-data
 * Fetches and normalizes on-chain and off-chain market data
 * for pool universe filtering and snapshot ingestion.
 */

import { ethers } from 'ethers';
import { fetchTopPoolsFromSubgraph, fetchPoolFromSubgraph } from './graphql';

// Default fallback subgraph URL (Uniswap v3 mainnet via The Graph hosted service)
const DEFAULT_SUBGRAPH_URL =
  'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';

// Minimal Uniswap v3 Pool ABI — only what we need for on-chain snapshot
const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
];

export interface PoolMarketData {
  poolAddress: string;
  token0: string;
  token1: string;
  token0Symbol: string;
  token1Symbol: string;
  feeTier: number;
  tvlUsd: number;
  volume24hUsd: number;
  feesUsd24h: number;
  liquidity: bigint;
  sqrtPriceX96: bigint;
  tick: number;
  token0Price: number;
  token1Price: number;
  timestamp: number;
}

export interface MarketDataConfig {
  rpcUrl: string;
  subgraphUrl?: string;
  minTvlUsd: number;    // default: 500_000
  minVolume24hUsd: number; // default: 1_000_000
}

export interface OnChainPoolSnapshot {
  poolAddress: string;
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  blockNumber: number;
  timestamp: number;
}

/**
 * MarketDataService — fetches pool data from The Graph / on-chain RPC.
 * Filters pools by TVL and volume thresholds before returning.
 */
export class MarketDataService {
  private config: MarketDataConfig;
  private provider: ethers.JsonRpcProvider;
  private subgraphUrl: string;

  constructor(config: MarketDataConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.subgraphUrl = config.subgraphUrl ?? DEFAULT_SUBGRAPH_URL;
  }

  /**
   * Fetch top pools from Uniswap v3 subgraph and filter by universe criteria.
   * Returns normalized PoolMarketData[]
   */
  async getFilteredPools(): Promise<PoolMarketData[]> {
    const rawPools = await this.fetchFromSubgraph();
    return rawPools.filter(
      (p) =>
        p.tvlUsd >= this.config.minTvlUsd &&
        p.volume24hUsd >= this.config.minVolume24hUsd,
    );
  }

  /**
   * Fetch all pools from subgraph and normalize to PoolMarketData[]
   */
  private async fetchFromSubgraph(): Promise<PoolMarketData[]> {
    const subgraphPools = await fetchTopPoolsFromSubgraph(
      this.subgraphUrl,
      this.config.minTvlUsd,
      this.config.minVolume24hUsd,
    );

    const now = Math.floor(Date.now() / 1000);

    return subgraphPools.map((p) => ({
      poolAddress: p.id,
      token0: p.token0.id,
      token1: p.token1.id,
      token0Symbol: p.token0.symbol,
      token1Symbol: p.token1.symbol,
      feeTier: parseInt(p.feeTier, 10),
      tvlUsd: parseFloat(p.totalValueLockedUSD),
      volume24hUsd: parseFloat(p.volumeUSD),
      feesUsd24h: parseFloat(p.feesUSD),
      liquidity: BigInt(p.liquidity),
      sqrtPriceX96: BigInt(p.sqrtPrice),
      tick: parseInt(p.tick, 10),
      token0Price: parseFloat(p.token0Price),
      token1Price: parseFloat(p.token1Price),
      timestamp: now,
    }));
  }

  /**
   * Fetch on-chain snapshot for a specific pool.
   * Calls slot0() and liquidity() via ethers multicall-style sequential calls.
   * Used when subgraph data is stale or unavailable.
   */
  async getPoolSnapshot(poolAddress: string): Promise<OnChainPoolSnapshot | null> {
    try {
      const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);

      const [slot0Result, liquidityResult, blockNumber] = await Promise.all([
        pool.slot0() as Promise<[bigint, number, number, number, number, number, boolean]>,
        pool.liquidity() as Promise<bigint>,
        this.provider.getBlockNumber(),
      ]);

      const block = await this.provider.getBlock(blockNumber);

      return {
        poolAddress,
        sqrtPriceX96: slot0Result[0],
        tick: Number(slot0Result[1]),
        liquidity: liquidityResult,
        blockNumber,
        timestamp: block?.timestamp ?? Math.floor(Date.now() / 1000),
      };
    } catch (err) {
      console.error(`[market-data] Failed to fetch on-chain snapshot for ${poolAddress}:`, err);
      return null;
    }
  }

  /**
   * Fetch single pool data by address (subgraph + optional on-chain fallback).
   */
  async getPoolData(poolAddress: string): Promise<PoolMarketData | null> {
    try {
      const subgraphPool = await fetchPoolFromSubgraph(this.subgraphUrl, poolAddress);
      if (!subgraphPool) return null;

      const now = Math.floor(Date.now() / 1000);
      return {
        poolAddress: subgraphPool.id,
        token0: subgraphPool.token0.id,
        token1: subgraphPool.token1.id,
        token0Symbol: subgraphPool.token0.symbol,
        token1Symbol: subgraphPool.token1.symbol,
        feeTier: parseInt(subgraphPool.feeTier, 10),
        tvlUsd: parseFloat(subgraphPool.totalValueLockedUSD),
        volume24hUsd: parseFloat(subgraphPool.volumeUSD),
        feesUsd24h: parseFloat(subgraphPool.feesUSD),
        liquidity: BigInt(subgraphPool.liquidity),
        sqrtPriceX96: BigInt(subgraphPool.sqrtPrice),
        tick: parseInt(subgraphPool.tick, 10),
        token0Price: parseFloat(subgraphPool.token0Price),
        token1Price: parseFloat(subgraphPool.token1Price),
        timestamp: now,
      };
    } catch (err) {
      console.error(`[market-data] Failed to fetch pool data for ${poolAddress}:`, err);
      return null;
    }
  }
}

export default MarketDataService;
