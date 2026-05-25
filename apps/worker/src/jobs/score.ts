/**
 * @job score
 * Reads active pools from DB, runs risk assessment + scoring,
 * and persists PoolScore records.
 * Runs every 15 minutes.
 */

import { db, audit } from '@ratio/db';
import { RiskEngine } from '@ratio/risk-engine';
import { ScoringEngine, ScoringInput } from '@ratio/scoring-engine';

const EVALUATION_WINDOW_DAYS = parseInt(process.env.EVALUATION_WINDOW_DAYS ?? '7');
const MAX_DRAWDOWN_PCT = parseFloat(process.env.MAX_DRAWDOWN_PCT ?? '0.03');
const MAX_RISK_SCORE = parseFloat(process.env.MAX_RISK_SCORE ?? '0.35');

export async function runScoreJob(): Promise<void> {
  console.log('[score] Starting risk + scoring pipeline...');

  const riskEngine = new RiskEngine({ maxDrawdownPct: MAX_DRAWDOWN_PCT, maxRiskScore: MAX_RISK_SCORE });
  const scoringEngine = new ScoringEngine();

  // Load active pools with latest snapshot and open positions
  const pools = await db.pool.findMany({
    where: { isActive: true, isNewListing: false },
    include: {
      snapshots: {
        orderBy: { timestamp: 'desc' },
        take: 1,
      },
      positions: {
        where: { status: 'open' },
        orderBy: { entryTimestamp: 'desc' },
        take: 1,
      },
    },
  });

  console.log(`[score] Evaluating ${pools.length} active pools`);

  const scoringInputs: ScoringInput[] = [];
  const windowStart = new Date(Date.now() - EVALUATION_WINDOW_DAYS * 86400 * 1000);

  for (const pool of pools) {
    const snap = pool.snapshots[0];
    if (!snap) continue;

    // Aggregate net profit over evaluation window
    const windowSnapshots = await db.poolSnapshot.aggregate({
      where: { poolId: pool.id, timestamp: { gte: windowStart } },
      _sum: { feesUsd24h: true },
      _avg: { tvlUsd: true },
    });

    const netProfitUsd7d = windowSnapshots._sum.feesUsd24h ?? 0;
    const avgTvl = windowSnapshots._avg.tvlUsd ?? 0;
    const position = pool.positions[0];
    const daysSinceRebalance = position
      ? Math.floor((Date.now() - position.entryTimestamp.getTime()) / 86400000)
      : EVALUATION_WINDOW_DAYS;

    // Risk assessment
    const risk = riskEngine.assess({
      poolAddress: pool.address,
      currentValueUsd: position?.capitalUsd ?? avgTvl,
      peakValueUsd: position?.capitalUsd ?? avgTvl,
      volatility7d: Math.min(snap.volume24hUsd / Math.max(snap.tvlUsd, 1), 1),
      concentrationPct: position ? position.capitalUsd / Math.max(avgTvl, 1) : 0,
      isNewListing: pool.isNewListing,
    });

    // Persist risk assessment
    await db.riskAssessment.create({
      data: {
        poolId: pool.id,
        riskScore: risk.riskScore,
        drawdownPct: risk.drawdownPct,
        concentrationPct: position ? position.capitalUsd / Math.max(avgTvl, 1) : 0,
        volatility7d: Math.min(snap.volume24hUsd / Math.max(snap.tvlUsd, 1), 1),
        isAllowed: risk.isAllowed,
        reason: risk.reason,
      },
    });

    if (!risk.isAllowed) {
      console.log(`[score] Pool ${pool.address} blocked by risk: ${risk.reason}`);
      continue;
    }

    scoringInputs.push({
      poolAddress: pool.address,
      netProfitUsd7d,
      volume7dUsd: snap.volume24hUsd * 7,
      riskScore: risk.riskScore,
      daysSinceLastRebalance: daysSinceRebalance,
      isActive: true,
    });
  }

  const scored = scoringEngine.scoreAll(scoringInputs);

  // Persist pool scores
  for (const s of scored) {
    const pool = pools.find((p) => p.address === s.poolAddress);
    if (!pool) continue;

    await db.poolScore.create({
      data: {
        poolId: pool.id,
        score: s.score,
        rank: s.rank,
        profitComponent: s.breakdown.profit,
        volumeComponent: s.breakdown.volume,
        riskComponent: s.breakdown.risk,
        recencyComponent: s.breakdown.recency,
        netProfitUsd7d: scoringInputs.find((i) => i.poolAddress === s.poolAddress)?.netProfitUsd7d ?? 0,
        volume7dUsd: scoringInputs.find((i) => i.poolAddress === s.poolAddress)?.volume7dUsd ?? 0,
        riskScore: scoringInputs.find((i) => i.poolAddress === s.poolAddress)?.riskScore ?? 0,
        daysSinceLastRebalance: scoringInputs.find((i) => i.poolAddress === s.poolAddress)?.daysSinceLastRebalance ?? 0,
        windowStartAt: windowStart,
        windowEndAt: new Date(),
      },
    });
  }

  await audit('score_completed', 'system', 'worker', 'system', {
    poolsScored: scored.length,
    topPool: scored[0]?.poolAddress,
    topScore: scored[0]?.score,
  });

  console.log(`[score] Scored ${scored.length} pools. Top: ${scored[0]?.poolAddress} (${scored[0]?.score?.toFixed(4)})`);
}
