/**
 * @app worker
 * Ratio background worker — fully-wired strategy evaluation loop.
 *
 * Cycle (every WORKER_CYCLE_MS, default 60s):
 *   1. Fetch active pools from DB
 *   2. Fetch market data snapshot (subgraph + on-chain fallback)
 *   3. Score pools via ScoringEngine
 *   4. Enforce policy constraints (TVL, volume, risk, chain, fee tier)
 *   5. Allocate capital via AllocationEngine
 *   6. Persist PoolScore rows to DB
 *   7. Emit RebalanceDecision rows with status PENDING_APPROVAL
 *   8. Update ServiceHeartbeat
 *
 * To run: pnpm --filter @ratio/worker start
 */

import { db, disconnectDb, heartbeat } from '@ratio/db';
import { ScoringEngine, ScoringInput } from '@ratio/scoring-engine';
import { AllocationEngine } from '@ratio/allocation-engine';
import { loadDefaultPolicy } from '@ratio/policy-engine';
import { MarketDataService, PoolMarketData } from '@ratio/market-data';
import { startHeartbeat } from './heartbeat';
import { runLLMAnalyzeJob } from './jobs/llm-analyze';

const DRY_RUN = process.env.EXECUTION_MODE !== 'live';
const CYCLE_MS = parseInt(process.env.WORKER_CYCLE_MS ?? '60000', 10);
const SERVICE = 'worker';

const RPC_URL = process.env.RPC_URL;
const SUBGRAPH_URL = process.env.UNISWAP_SUBGRAPH_URL;
const TOTAL_CAPITAL_USD = parseFloat(process.env.TOTAL_CAPITAL_USD ?? '10000');
const TOP_N_POOLS = parseInt(process.env.TOP_N_POOLS ?? '5', 10);

if (!RPC_URL) {
  console.error('[worker] RPC_URL not set. Exiting.');
  process.exit(1);
}

const scoring = new ScoringEngine();
const allocation = new AllocationEngine();
const policy = loadDefaultPolicy();
const marketData = new MarketDataService({
  rpcUrl: RPC_URL,
  subgraphUrl: SUBGRAPH_URL,
  minTvlUsd: policy.poolPolicy.minTvlUsd,
  minVolume24hUsd: policy.poolPolicy.minDailyVolumeUsd,
});

console.log(`[worker] Starting... DRY_RUN=${DRY_RUN}, cycle=${CYCLE_MS}ms, capital=$${TOTAL_CAPITAL_USD}`);

// Keep ops-bot heartbeat alive every 60s
startHeartbeat(db);

let running = false;
let cycleCount = 0;
const LLM_ANALYZE_INTERVAL = 30;

// ---- helpers ----------------------------------------------------------------

function toBucket(
  address: string,
  score: number,
): 'coreIncome' | 'activeBalanced' | 'layeredPositions' {
  // Simple deterministic bucketing by score band
  // Can be replaced with on-chain data / LLM classification
  if (score >= 0.65) return 'coreIncome';
  if (score >= 0.35) return 'activeBalanced';
  return 'layeredPositions';
}

function passesPolicy(pool: PoolMarketData): boolean {
  if (pool.tvlUsd < policy.poolPolicy.minTvlUsd) return false;
  if (pool.volume24hUsd < policy.poolPolicy.minDailyVolumeUsd) return false;
  if (!policy.protocolScope.allowedFeeTiersBps.includes(pool.feeTier / 10)) return false;
  return true;
}

// ---- main cycle -------------------------------------------------------------

async function runCycle(): Promise<void> {
  if (running) {
    console.warn('[worker] Previous cycle still running, skipping.');
    return;
  }
  running = true;
  const cycleStart = Date.now();

  try {
    // 1. Active pools from DB
    const dbPools = await db.pool.findMany({ where: { isActive: true } });
    if (!dbPools.length) {
      console.log('[worker] No active pools in DB. Skipping cycle.');
      await heartbeat(SERVICE, 'ok');
      return;
    }
    console.log(`[worker] Cycle start — ${dbPools.length} DB pool(s)`);

    // 2. Market data
    let marketPools: PoolMarketData[] = [];
    try {
      marketPools = await marketData.getFilteredPools();
      console.log(`[worker] Market data: ${marketPools.length} pool(s) passed TVL/volume filter`);
    } catch (err) {
      console.warn('[worker] Market data fetch failed, using DB pool addresses only:', err);
    }

    // Build lookup map: poolAddress -> market data
    const marketMap = new Map(marketPools.map((p) => [p.poolAddress.toLowerCase(), p]));

    // 3. Build scoring inputs — join DB pools with market data
    const scoringInputs: ScoringInput[] = dbPools
      .map((dbPool): ScoringInput | null => {
        const md = marketMap.get(dbPool.address.toLowerCase());
        if (!md) {
          // Pool exists in DB but not in market data — use floor values
          return {
            poolAddress: dbPool.address,
            netProfitUsd7d: 0,
            volume7dUsd: 0,
            riskScore: 0.5,
            daysSinceLastRebalance: 7,
            isActive: dbPool.isActive,
          };
        }
        if (!passesPolicy(md)) return null; // Policy veto
        return {
          poolAddress: md.poolAddress,
          netProfitUsd7d: md.feesUsd24h * 7, // Estimate 7d from 24h fees
          volume7dUsd: md.volume24hUsd * 7,
          riskScore: Math.min(1 - md.tvlUsd / 50_000_000, 0.9), // Proxy: higher TVL = lower risk
          daysSinceLastRebalance: 1,
          isActive: true,
        };
      })
      .filter((x): x is ScoringInput => x !== null);

    if (!scoringInputs.length) {
      console.log('[worker] No pools passed policy filter. Skipping decisions.');
      await heartbeat(SERVICE, 'ok');
      return;
    }

    // 4. Score
    const scored = scoring.scoreAll(scoringInputs);
    const topPools = scored.slice(0, TOP_N_POOLS);
    console.log(
      `[worker] Scored ${scored.length} pool(s), top ${topPools.length}: ${topPools.map((p) => `${p.poolAddress.slice(0, 8)}…(${p.score.toFixed(3)})`).join(', ')}`,
    );

    // 5. Persist PoolScore rows
    await Promise.all(
      scored.map((s) =>
        db.poolScore.create({
          data: {
            poolId: s.poolAddress,
            score: s.score,
            rank: s.rank,
            breakdown: s.breakdown as object,
          },
        }).catch((err) => console.warn(`[worker] PoolScore upsert failed for ${s.poolAddress}:`, err)),
      ),
    );

    // 6. Allocate capital
    const allocationInputs = topPools.map((s) => ({
      poolAddress: s.poolAddress,
      score: s.score,
      bucket: toBucket(s.poolAddress, s.score),
    }));

    const allocations = allocation.allocate({
      totalCapitalUsd: TOTAL_CAPITAL_USD,
      buckets: {
        coreIncome: policy.capitalPolicy.coreIncomePct,
        activeBalanced: policy.capitalPolicy.activeBalancedPct,
        layeredPositions: policy.capitalPolicy.layeredPositionsPct,
        experimental: 0,
      },
      poolScores: allocationInputs,
    });

    // 7. Emit RebalanceDecision rows (PENDING_APPROVAL)
    const existingOpen = await db.position.findMany({ where: { status: 'OPEN' } });
    const openAddresses = new Set(existingOpen.map((p) => p.poolId.toLowerCase()));

    let newDecisions = 0;
    for (const alloc of allocations) {
      // Skip if we already have an open position in this pool
      if (openAddresses.has(alloc.poolAddress.toLowerCase())) continue;
      // Skip tiny allocations
      if (alloc.allocatedUsd < 50) continue;

      try {
        await db.rebalanceDecision.create({
          data: {
            poolId: alloc.poolAddress,
            action: 'OPEN',
            status: 'PENDING_APPROVAL',
            isDryRun: DRY_RUN,
            reason: `Score-based allocation: $${alloc.allocatedUsd.toFixed(2)} (${(alloc.allocationPct * 100).toFixed(1)}%) bucket=${alloc.bucket}`,
            metadata: { allocatedUsd: alloc.allocatedUsd, bucket: alloc.bucket } as object,
          },
        });
        newDecisions++;
      } catch (err) {
        console.warn(`[worker] Decision create failed for ${alloc.poolAddress}:`, err);
      }
    }

    const elapsed = Date.now() - cycleStart;
    cycleCount++;
    console.log(
      `[worker] Cycle ${cycleCount} complete in ${elapsed}ms — ${newDecisions} new decision(s) created (PENDING_APPROVAL)`,
    );

    // LLM advisory analysis — runs every 30 cycles
    if (cycleCount % LLM_ANALYZE_INTERVAL === 0) {
      console.log('[worker] Triggering LLM advisory analysis...');
      void runLLMAnalyzeJob().catch((err) =>
        console.error('[worker] LLM analyze job failed:', err),
      );
    }

    await heartbeat(SERVICE, 'ok');
  } catch (err) {
    console.error('[worker] Cycle error:', err);
    await heartbeat(SERVICE, 'error').catch(() => {});
  } finally {
    running = false;
  }
}

// ---- start ------------------------------------------------------------------
const timer = setInterval(() => void runCycle(), CYCLE_MS);
void runCycle();

process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received, shutting down...');
  clearInterval(timer);
  await disconnectDb();
  process.exit(0);
});
