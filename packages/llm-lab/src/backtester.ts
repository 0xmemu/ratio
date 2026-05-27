import type { StrategyProposal } from './strategy-agent';

export interface HistoricalSnapshot {
  timestamp: number;
  price: number;
  volume: number;
  volatility: number;
  fees24h?: number;
  liquidityUsd?: number;
}

export interface BacktestTick {
  timestamp: number;
  price: number;
  inRange: boolean;
  feesEarned: number;
  ilPct: number;
  cumulativePnlUsd: number;
}

export interface BacktestResult {
  simulatedProfitUsd: number;
  maxDrawdown: number;
  rebalanceCount: number;
  profitable: boolean;
  totalFeesEarned: number;
  totalImpermanentLossUsd: number;
  timeInRangePct: number;
  sharpeRatio: number;
  ticks: BacktestTick[];
}

export class Backtester {
  /**
   * Impermanent loss formula for Uniswap V2-style (approximation for V4 concentrated LP).
   * IL = 2*sqrt(r)/(1+r) - 1  where r = currentPrice / entryPrice
   */
  private computeILPct(entryPrice: number, currentPrice: number): number {
    if (entryPrice <= 0) return 0;
    const r = currentPrice / entryPrice;
    return (2 * Math.sqrt(r)) / (1 + r) - 1; // negative means loss
  }

  private isInRange(
    price: number,
    entryPrice: number,
    lowerPct: number,
    upperPct: number
  ): boolean {
    const lower = entryPrice * (1 - lowerPct / 100);
    const upper = entryPrice * (1 + upperPct / 100);
    return price >= lower && price <= upper;
  }

  run(
    strategy: StrategyProposal,
    snapshots: HistoricalSnapshot[]
  ): BacktestResult {
    if (snapshots.length === 0) {
      return {
        simulatedProfitUsd: 0,
        maxDrawdown: 0,
        rebalanceCount: 0,
        profitable: false,
        totalFeesEarned: 0,
        totalImpermanentLossUsd: 0,
        timeInRangePct: 0,
        sharpeRatio: 0,
        ticks: [],
      };
    }

    const capital = strategy.suggestedCapitalUsd;
    const ticks: BacktestTick[] = [];
    let entryPrice = snapshots[0].price;
    let cumulativePnl = 0;
    let totalFees = 0;
    let inRangeCount = 0;
    let rebalanceCount = 0;
    let maxPnl = 0;
    let maxDrawdown = 0;
    const pnlHistory: number[] = [];

    for (const snap of snapshots) {
      const inRange = this.isInRange(
        snap.price,
        entryPrice,
        strategy.lowerPricePct,
        strategy.upperPricePct
      );

      // Rebalance if out of range
      if (!inRange) {
        rebalanceCount++;
        entryPrice = snap.price; // reset range around new price
      }

      // Fees: only earned when in range, proportional to daily fee rate
      const dailyFeeRate = snap.fees24h && snap.liquidityUsd
        ? snap.fees24h / snap.liquidityUsd
        : (snap.volume * 0.003) / Math.max(capital, 1);
      const feesEarned = inRange ? capital * dailyFeeRate : 0;
      totalFees += feesEarned;

      // IL (applies even when in range, approximated)
      const ilPct = this.computeILPct(entryPrice, snap.price);
      const ilUsd = capital * Math.abs(ilPct);

      cumulativePnl = totalFees - ilUsd;
      pnlHistory.push(cumulativePnl);
      if (cumulativePnl > maxPnl) maxPnl = cumulativePnl;
      const drawdown = maxPnl - cumulativePnl;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      if (inRange) inRangeCount++;

      ticks.push({
        timestamp: snap.timestamp,
        price: snap.price,
        inRange,
        feesEarned,
        ilPct,
        cumulativePnlUsd: cumulativePnl,
      });
    }

    const timeInRangePct = (inRangeCount / snapshots.length) * 100;
    const totalImpermanentLossUsd = Math.max(0, totalFees - cumulativePnl);

    // Sharpe: mean daily PnL / stddev of daily PnL
    const dailyPnls = pnlHistory.map((v, i) => (i === 0 ? v : v - pnlHistory[i - 1]));
    const mean = dailyPnls.reduce((a, b) => a + b, 0) / dailyPnls.length;
    const variance =
      dailyPnls.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyPnls.length;
    const stddev = Math.sqrt(variance);
    const sharpeRatio = stddev > 0 ? (mean / stddev) * Math.sqrt(365) : 0;

    return {
      simulatedProfitUsd: cumulativePnl,
      maxDrawdown,
      rebalanceCount,
      profitable: cumulativePnl > 0,
      totalFeesEarned: totalFees,
      totalImpermanentLossUsd,
      timeInRangePct,
      sharpeRatio,
      ticks,
    };
  }
}

export default Backtester;
