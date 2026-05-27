/**
 * @job llm-analyze
 * Runs the LLM Lab autonomous orchestrator pipeline on top-scored pools.
 * Produces advisory insights — never executes transactions.
 * Runs every 30 minutes.
 */

import { db, audit } from '@ratio/db';
import { AutonomousOrchestrator } from '@ratio/llm-lab';
import type { PoolMetrics, HistoricalSnapshot } from '@ratio/llm-lab';

const DRY_RUN = process.env.EXECUTION_MODE !== 'live';
const TOP_N = parseInt(process.env.LLM_ANALYZE_TOP_N ?? '5');
const SNAPSHOT_LOOKBACK_DAYS = parseInt(process.env.LLM_SNAPSHOT_LOOKBACK_DAYS ?? '14');
const INITIAL_CAPITAL_USD = parseFloat(process.env.LLM_INITIAL_CAPITAL_USD ?? '5000');
const GAS_COST_USD = parseFloat(process.env.LLM_GAS_COST_USD ?? '15');
const REBALANCE_FREQ = parseInt(process.env.LLM_REBALANCE_FREQ ?? '4');

export async function runLLMAnalyzeJob(): Promise<void> {
  console.log(`[llm-analyze] Starting advisory pipeline (dryRun=${DRY_RUN})...`);

  const orchestrator = new AutonomousOrchestrator({
    sandboxMode: true,
    useLLM: !!process.env.LLM_API_KEY,
    initialCapitalUsd: INITIAL_CAPITAL_USD,
    gasCostUsd: GAS_COST_USD,
    rebalanceFrequencyPerMonth: REBALANCE_FREQ,
  });

  const lookbackStart = new Date(Date.now() - SNAPSHOT_LOOKBACK_DAYS * 86400 * 1000);

  // Get top-scored pools with recent snapshots
  const topScores = await db.poolScore.findMany({
    orderBy: { createdAt: 'desc' },
    distinct: ['poolId'],
    take: TOP_N,
    include: {
      pool: {
        include: {
          snapshots: {
            where: { timestamp: { gte: lookbackStart } },
            orderBy: { timestamp: 'asc' },
          },
        },
      },
    },
  });

  if (!topScores.length) {
    console.log('[llm-analyze] No scored pools found. Skipping.');
    return;
  }

  console.log(`[llm-analyze] Analyzing ${topScores.length} top-scored pools...`);

  let analyzed = 0;
  let profitableRecs = 0;

  for (const s of topScores) {
    const pool = s.pool;
    const snaps = pool.snapshots;

    if (snaps.length < 2) {
      console.log(`[llm-analyze] Skipping ${pool.address} — insufficient snapshot data (${snaps.length})`);
      continue;
    }

    const latest = snaps[snaps.length - 1];

    // Build metrics from latest snapshot + score
    const metrics: PoolMetrics = {
      poolAddress: pool.address,
      token0Symbol: pool.token0Symbol ?? 'TOKEN0',
      token1Symbol: pool.token1Symbol ?? 'TOKEN1',
      feeTier: pool.feeTier,
      volume24h: latest.volume24hUsd,
      fees24h: latest.feesUsd24h ?? 0,
      liquidityUsd: latest.tvlUsd,
      volatilityScore: Math.min(10, (latest.volume24hUsd / Math.max(latest.tvlUsd, 1)) * 5),
      timestamp: latest.timestamp.getTime(),
    };

    // Convert DB snapshots to HistoricalSnapshot format
    const historicalSnapshots: HistoricalSnapshot[] = snaps.map((sn) => ({
      timestamp: sn.timestamp.getTime(),
      price: sn.token0Price,
      volume: sn.volume24hUsd,
      volatility: sn.volume24hUsd / Math.max(sn.tvlUsd, 1),
      fees24h: sn.feesUsd24h,
      liquidityUsd: sn.tvlUsd,
    }));

    // Run the full LLM Lab pipeline (advisory only)
    const result = await orchestrator.run(metrics, historicalSnapshots);

    console.log(
      `[llm-analyze] ${pool.address.slice(0, 10)}… → ${result.action.toUpperCase()} ` +
      `(score=${result.opportunityScore.toFixed(1)}, risk=${result.riskLevel}, ` +
      `strategy=${result.strategyType}, confidence=${result.confidence.toFixed(0)}%)`
    );

    if (result.approved) profitableRecs++;

    // Persist the LLM analysis result as a note/annotation
    try {
      await db.poolScore.update({
        where: { id: s.id },
        data: {
          breakdown: {
            ...(s.breakdown as object ?? {}),
            llmAnalysis: {
              action: result.action,
              riskLevel: result.riskLevel,
              strategyType: result.strategyType,
              confidence: result.confidence,
              simulatedProfitUsd: result.simulatedProfitUsd,
              approved: result.approved,
              rationale: result.llmRationale,
              timestamp: result.timestamp,
            },
          },
        },
      });
    } catch (err) {
      console.warn(`[llm-analyze] Failed to persist analysis for ${pool.address}:`, err);
    }

    analyzed++;
  }

  await audit('llm_analyze_completed', 'system', 'worker', 'system', {
    poolsAnalyzed: analyzed,
    profitableRecommendations: profitableRecs,
    dryRun: DRY_RUN,
  });

  console.log(`[llm-analyze] Done. ${analyzed} pools analyzed, ${profitableRecs} profitable recommendations.`);
}
