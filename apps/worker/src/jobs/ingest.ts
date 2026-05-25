/**
 * @job ingest
 * Fetches pool market data from Uniswap v3 subgraph and on-chain.
 * Persists pool records and snapshots to DB.
 * Runs every 5 minutes.
 */

import { db, audit } from '@ratio/db';
import { MarketDataService } from '@ratio/market-data';

const ALLOWED_FEE_TIERS = [500, 3000];
const MIN_TVL_USD = parseFloat(process.env.MIN_TVL_USD ?? '500000');
const MIN_VOLUME_USD = parseFloat(process.env.MIN_DAILY_VOLUME_USD ?? '1000000');

export async function runIngestJob(): Promise<void> {
  const service = new MarketDataService({
    rpcUrl: process.env.ETH_RPC_URL!,
    subgraphUrl: process.env.UNISWAP_SUBGRAPH_URL,
    minTvlUsd: MIN_TVL_USD,
    minVolume24hUsd: MIN_VOLUME_USD,
  });

  console.log('[ingest] Fetching pool market data...');
  const pools = await service.getFilteredPools();

  // Only process allowed fee tiers
  const filtered = pools.filter((p) => ALLOWED_FEE_TIERS.includes(p.feeTier));
  console.log(`[ingest] ${filtered.length} pools passed fee tier filter`);

  for (const pool of filtered) {
    // Upsert pool record
    const dbPool = await db.pool.upsert({
      where: { address: pool.poolAddress },
      update: {
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        address: pool.poolAddress,
        token0: pool.token0,
        token1: pool.token1,
        token0Symbol: pool.token0,
        token1Symbol: pool.token1,
        feeTier: pool.feeTier,
        isActive: true,
        isBlueChip: true,
        isNewListing: false,
      },
    });

    // Persist snapshot
    await db.poolSnapshot.create({
      data: {
        poolId: dbPool.id,
        tick: pool.tick,
        sqrtPriceX96: pool.sqrtPriceX96.toString(),
        liquidity: pool.liquidity.toString(),
        tvlUsd: pool.tvlUsd,
        volume24hUsd: pool.volume24hUsd,
        feesUsd24h: 0,
        token0Price: 1,
        token1Price: pool.tvlUsd > 0 ? pool.tvlUsd / 2 : 0,
        blockNumber: BigInt(0),
        timestamp: new Date(pool.timestamp * 1000),
      },
    });
  }

  await audit('ingest_completed', 'system', 'worker', 'system', {
    poolCount: filtered.length,
  });

  console.log(`[ingest] Done. Persisted ${filtered.length} pool snapshots.`);
}
