/**
 * @package backtest-core
 * Backtesting framework for LP strategies using historical pool data.
 * Simulates tick-level position performance without on-chain state.
 */

export interface BacktestConfig {
  startTimestamp: number;
  endTimestamp: number;
  initialCapitalUsd: number;
  feeTier: number;             // 500 | 3000
  tickSpacing: number;         // derived from fee tier
  slippageBps: number;         // simulated slippage in basis points
  gasCostPerTxUsd: number;     // estimated gas cost per tx
  evaluationWindowDays: number; // v1: 7
}

export interface TickSnapshot {
  timestamp: number;
  tick: number;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  token0Price: number;
  token1Price: number;
  volume24hUsd: number;
  feesEarned0: number;
  feesEarned1: number;
}

export interface BacktestPosition {
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  entryTimestamp: number;
  exitTimestamp?: number;
  capitalUsd: number;
}

export interface BacktestResult {
  poolAddress: string;
  config: BacktestConfig;
  totalPnlUsd: number;
  feesEarnedUsd: number;
  gasCostUsd: number;
  netPnlUsd: number;
  maxDrawdownPct: number;
  rebalanceCount: number;
  sharpeRatio: number;
  positions: BacktestPosition[];
  snapshotCount: number;
}

/**
 * BacktestEngine — simulates LP strategy performance on historical data.
 * Used by apps/simulator and apps/strategy-lab.
 */
export class BacktestEngine {
  private config: BacktestConfig;

  constructor(config: BacktestConfig) {
    this.config = config;
  }

  /**
   * Run a backtest on a given pool with historical snapshots.
   * Returns performance metrics.
   */
  run(
    poolAddress: string,
    snapshots: TickSnapshot[],
    strategyFn: (snapshot: TickSnapshot, currentPosition: BacktestPosition | null) => BacktestPosition | null,
  ): BacktestResult {
    const filtered = snapshots
      .filter(
        (s) => s.timestamp >= this.config.startTimestamp && s.timestamp <= this.config.endTimestamp,
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    let capital = this.config.initialCapitalUsd;
    let currentPosition: BacktestPosition | null = null;
    let totalFees = 0;
    let totalGas = 0;
    let rebalanceCount = 0;
    let peakCapital = capital;
    let maxDrawdown = 0;
    const completedPositions: BacktestPosition[] = [];

    for (const snap of filtered) {
      // Accumulate fees if in position
      if (currentPosition) {
        const feeUsd = snap.feesEarned0 * snap.token0Price + snap.feesEarned1 * snap.token1Price;
        totalFees += feeUsd;
        capital += feeUsd;
      }

      // Ask strategy function for next position
      const nextPosition = strategyFn(snap, currentPosition);

      if (nextPosition !== currentPosition) {
        // Position changed — count rebalance
        if (currentPosition) {
          completedPositions.push({ ...currentPosition, exitTimestamp: snap.timestamp });
        }
        if (nextPosition) {
          const gasCost = this.config.gasCostPerTxUsd * (1 + this.config.slippageBps / 10000);
          totalGas += gasCost;
          capital -= gasCost;
          rebalanceCount++;
        }
        currentPosition = nextPosition;
      }

      // Track drawdown
      if (capital > peakCapital) peakCapital = capital;
      const drawdown = peakCapital > 0 ? (peakCapital - capital) / peakCapital : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    const netPnl = capital - this.config.initialCapitalUsd;
    const totalDays = (this.config.endTimestamp - this.config.startTimestamp) / 86400;
    const dailyReturns = netPnl / this.config.initialCapitalUsd / Math.max(totalDays, 1);
    // Simplified Sharpe: annualized return / assumed daily vol 0.02
    const sharpeRatio = (dailyReturns * 365) / 0.02;

    return {
      poolAddress,
      config: this.config,
      totalPnlUsd: capital - this.config.initialCapitalUsd + totalGas,
      feesEarnedUsd: totalFees,
      gasCostUsd: totalGas,
      netPnlUsd: netPnl,
      maxDrawdownPct: maxDrawdown,
      rebalanceCount,
      sharpeRatio,
      positions: completedPositions,
      snapshotCount: filtered.length,
    };
  }
}

export default BacktestEngine;
