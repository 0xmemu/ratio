import type { StrategyProposal } from './strategy-agent';

export interface HistoricalSnapshot {
  timestamp: number;
  price: number;
  volume: number;
  volatility: number;
}

export interface BacktestResult {
  simulatedProfitUsd: number;
  maxDrawdown: number;
  rebalanceCount: number;
  profitable: boolean;
}

export class Backtester {
  run(
    strategy: StrategyProposal,
    snapshots: HistoricalSnapshot[]
  ): BacktestResult {
    const volatilityPenalty = snapshots.reduce((sum, snapshot) => {
      return sum + snapshot.volatility;
    }, 0);

    const simulatedProfitUsd =
      strategy.confidence * 10 - volatilityPenalty;

    return {
      simulatedProfitUsd,
      maxDrawdown: volatilityPenalty * 0.1,
      rebalanceCount: Math.floor(snapshots.length / 7),
      profitable: simulatedProfitUsd > 0,
    };
  }
}

export default Backtester;
