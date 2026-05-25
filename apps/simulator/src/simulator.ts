/**
 * @module simulator
 * Dry-run replay engine for Ratio v1.
 * Loads historical PoolSnapshot data from DB and runs the full
 * score -> risk -> strategy -> backtest pipeline without touching on-chain state.
 *
 * Outputs a per-pool BacktestResult summary to stdout (JSON).
 * NEVER writes to DB — read-only consumer of existing snapshots.
 *
 * To run: pnpm --filter @ratio/simulator start
 */

import { db } from '@ratio/db';
import { BacktestEngine } from '@ratio/backtest-core';
import { ScoringEngine } from '@ratio/scoring-engine';
import { RiskEngine } from '@ratio/risk-engine';
import { StrategyEngine } from '@ratio/strategy-engine';

// ── Env config ───────────────────────────────────────────────────────────────
const SIMULATION_DAYS     = parseInt(process.env.SIMULATION_DAYS       ?? '30');
const INITIAL_CAPITAL_USD = parseFloat(process.env.INITIAL_CAPITAL_USD ?? '10000');
const FEE_TIER            = parseInt(process.env.FEE_TIER              ?? '500') as 500 | 3000;
const SLIPPAGE_BPS        = parseInt(process.env.SLIPPAGE_BPS          ?? '50');
const GAS_COST_PER_TX_USD = parseFloat(process.env.GAS_COST_PER_TX_USD ?? '5');
const MAX_DRAWDOWN_PCT    = parseFloat(process.env.MAX_DRAWDOWN_PCT    ?? '0.03');
const MAX_RISK_SCORE      = parseFloat(process.env.MAX_RISK_SCORE      ?? '0.35');
const MIN_NET_PROFIT_USD  = parseFloat(process.env.MIN_NET_PROFIT_USD  ?? '100');
const TOP_POOLS           = parseInt(process.env.TOP_POOLS             ?? '10');

// ── Types ────────────────────────────────────────────────────────────────────
interface SimResult {
  poolAddress:    string;
  score:          number;
  netPnlUsd:      number;
  feesEarnedUsd:  number;
  gasCostUsd:     number;
  maxDrawdownPct: number;
  sharpeRatio:    number;
  rebalanceCount: number;
  snapshotCount:  number;
}

// ── Main ─────────────────────────────────────────────────────────────────────
export async function runSimulator(): Promise<void> {
  const windowStart = new Date(Date.now() - SIMULATION_DAYS * 86_400 * 1_000);

  console.log('[simulator] ── Config ──────────────────────────────────────────');
  console.log(`  simulationDays    = ${SIMULATION_DAYS}`);
  console.log(`  initialCapitalUsd = ${INITIAL_CAPITAL_USD}`);
  console.log(`  feeTier           = ${FEE_TIER}`);
  console.log(`  slippageBps       = ${SLIPPAGE_BPS}`);
  console.log(`  gasCostPerTxUsd   = ${GAS_COST_PER_TX_USD}`);
  console.log(`  maxDrawdownPct    = ${MAX_DRAWDOWN_PCT}`);
  console.log(`  minNetProfitUsd   = ${MIN_NET_PROFIT_USD}`);
  console.log(`  topPools          = ${TOP_POOLS}`);

  // ── 1. Load candidate pools with snapshots ─────────────────────────────────
  const pools = await db.pool.findMany({
    where: {
      isActive:     true,
      isNewListing: false,
      feeTier:      FEE_TIER,
    },
    include: {
      snapshots: {
        where:   { timestamp: { gte: windowStart } },
        orderBy: { timestamp: 'asc' },
      },
    },
    take: TOP_POOLS * 4,
  });

  console.log(`\n[simulator] Loaded ${pools.length} candidate pool(s) from DB`);

  // ── 2. Instantiate engines ─────────────────────────────────────────────────
  const riskEngine     = new RiskEngine({ maxDrawdownPct: MAX_DRAWDOWN_PCT, maxRiskScore: MAX_RISK_SCORE });
  const scoringEngine  = new ScoringEngine();
  const strategyEngine = new StrategyEngine({ minNetProfitUsd: MIN_NET_PROFIT_USD, dryRun: true });
  const backtestEngine = new BacktestEngine();

  // ── 3. Score & risk-gate ───────────────────────────────────────────────────
  const scored: Array<{
    poolAddress: string;
    score:       number;
    snapshots:   typeof pools[number]['snapshots'];
  }> = [];

  for (const pool of pools) {
    if (pool.snapshots.length < 3) continue;

    const recent = pool.snapshots[pool.snapshots.length - 1];
    const avgTvl = pool.snapshots.reduce((s, sn) => s + sn.tvlUsd, 0) / pool.snapshots.length;
    const fees7d = pool.snapshots.slice(-7).reduce((s, sn) => s + sn.feesUsd24h, 0);

    const { score } = scoringEngine.score({
      poolAddress:  pool.address,
      feeTier:      pool.feeTier,
      tvlUsd:       avgTvl,
      volume24hUsd: recent.volume24hUsd,
      feesUsd24h:   recent.feesUsd24h,
      feesUsd7d:    fees7d,
      liquidity:    BigInt(recent.liquidity),
      tick:         recent.tick,
      token0Price:  recent.token0Price,
      token1Price:  recent.token1Price,
      isBlueChip:   pool.isBlueChip,
      windowStart,
    });

    const riskResult = riskEngine.assess({
      poolAddress:  pool.address,
      score,
      tvlUsd:       avgTvl,
      volume24hUsd: recent.volume24hUsd,
      feesUsd24h:   recent.feesUsd24h,
      feeTier:      pool.feeTier,
    });

    if (riskResult.vetoed) {
      console.log(`[simulator] VETOED ${pool.address}: ${riskResult.reason}`);
      continue;
    }

    scored.push({ poolAddress: pool.address, score, snapshots: pool.snapshots });
  }

  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, TOP_POOLS);
  console.log(`[simulator] ${candidates.length} pool(s) passed risk gate — running backtest\n`);

  // ── 4. Backtest each pool ──────────────────────────────────────────────────
  const results: SimResult[] = [];
  const tickSpacing = FEE_TIER === 500 ? 10 : 60;

  for (const { poolAddress, score, snapshots } of candidates) {
    const first = snapshots[0];
    const last  = snapshots[snapshots.length - 1];

    const decision = strategyEngine.evaluate({
      poolAddress,
      score,
      currentPositionValueUsd: 0,
      netProfitUsd7d:          0,
      currentTickLower:        first.tick - 600,
      currentTickUpper:        first.tick + 600,
      optimalTickLower:        first.tick - 600,
      optimalTickUpper:        first.tick + 600,
      hasPosition:             false,
    });

    const tickSnapshots = snapshots.map((sn) => ({
      timestamp:    sn.timestamp.getTime(),
      tick:         sn.tick,
      sqrtPriceX96: BigInt(sn.sqrtPriceX96),
      liquidity:    BigInt(sn.liquidity),
      token0Price:  sn.token0Price,
      token1Price:  sn.token1Price,
      volume24hUsd: sn.volume24hUsd,
      feesEarned0:  sn.token0Price > 0 ? sn.feesUsd24h / 2 / sn.token0Price : 0,
      feesEarned1:  sn.token1Price > 0 ? sn.feesUsd24h / 2 / sn.token1Price : 0,
    }));

    const result = backtestEngine.run({
      poolAddress,
      config: {
        startTimestamp:       first.timestamp.getTime(),
        endTimestamp:         last.timestamp.getTime(),
        initialCapitalUsd:    INITIAL_CAPITAL_USD,
        feeTier:              FEE_TIER,
        tickSpacing,
        slippageBps:          SLIPPAGE_BPS,
        gasCostPerTxUsd:      GAS_COST_PER_TX_USD,
        evaluationWindowDays: SIMULATION_DAYS,
      },
      tickSnapshots,
      tickLower: decision.tickLower,
      tickUpper: decision.tickUpper,
    });

    const simResult: SimResult = {
      poolAddress,
      score,
      netPnlUsd:      result.netPnlUsd,
      feesEarnedUsd:  result.feesEarnedUsd,
      gasCostUsd:     result.gasCostUsd,
      maxDrawdownPct: result.maxDrawdownPct,
      sharpeRatio:    result.sharpeRatio,
      rebalanceCount: result.rebalanceCount,
      snapshotCount:  snapshots.length,
    };

    results.push(simResult);

    console.log(
      `[simulator] ${poolAddress.slice(0, 10)}... ` +
      `score=${score.toFixed(3)} | ` +
      `netPnl=$${result.netPnlUsd.toFixed(2)} | ` +
      `fees=$${result.feesEarnedUsd.toFixed(2)} | ` +
      `gas=$${result.gasCostUsd.toFixed(2)} | ` +
      `maxDD=${(result.maxDrawdownPct * 100).toFixed(2)}% | ` +
      `sharpe=${result.sharpeRatio.toFixed(3)} | ` +
      `rebalances=${result.rebalanceCount}`
    );
  }

  // ── 5. Summary ─────────────────────────────────────────────────────────────
  console.log('\n[simulator] ── Full Results (JSON) ─────────────────────────────');
  console.log(JSON.stringify(results, null, 2));

  const profitable  = results.filter((r) => r.netPnlUsd > 0).length;
  const totalNetPnl = results.reduce((s, r) => s + r.netPnlUsd, 0);
  const avgSharpe   = results.length > 0
    ? results.reduce((s, r) => s + r.sharpeRatio, 0) / results.length
    : 0;

  console.log('\n[simulator] ── Summary ──────────────────────────────────────────');
  console.log(`  Pools evaluated  : ${results.length}`);
  console.log(`  Profitable pools : ${profitable} / ${results.length}`);
  console.log(`  Total net PnL    : $${totalNetPnl.toFixed(2)}`);
  console.log(`  Avg Sharpe ratio : ${avgSharpe.toFixed(3)}`);
  console.log('[simulator] Done.');
}
