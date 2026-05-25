/**
 * @package market-data
 * Fetches and normalizes on-chain and off-chain market data
 * for pool universe filtering and snapshot ingestion.
 */

import { ethers } from 'ethers';

export interface PoolMarketData {
  poolAddress: string;
  token0: string;
  token1: string;
  feeTier: number;
  tvlUsd: number;
  volume24hUsd: number;
  liquidity: bigint;
  sqrtPriceX96: bigint;
  tick: number;
  timestamp: number;
}

export interface MarketDataConfig {
  rpcUrl: string;
  subgraphUrl?: string;
  minTvlUsd: number;       // default: 500_000
  minVolume24hUsd: number; // default: 1_000_000
}

/**
 * MarketDataService — fetches pool data from The Graph / on-chain RPC.
 * Filters pools by TVL and volume thresholds before returning.
 */
export class MarketDataService {
  private config: MarketDataConfig;
  private provider: ethers.JsonRpcProvider;

  constructor(config: MarketDataConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  /**
   * Fetch top pools from Uniswap v3 subgraph and filter by universe criteria.
   */
  async getFilteredPools(): Promise<PoolMarketData[]> {
    const pools = await this.fetchFromSubgraph();
    return pools.filter(
      (p) =>
        p.tvlUsd >= this.config.minTvlUsd &&
        p.volume24hUsd >= this.config.minVolume24hUsd,
    );
  }

  private async fetchFromSubgraph(): Promise<PoolMarketData[]> {
    // TODO: implement GraphQL query to Uniswap v3 subgraph
    // Returns normalized PoolMarketData[]
    return [];
  }

  async getPoolSnapshot(poolAddress: string): Promise<PoolMarketData | null> {
    // TODO: fetch slot0, liquidity from on-chain via multicall
    return null;
  }
}

export default MarketDataService;
