import type { StrategyProposal } from './strategy-agent';
import type { BacktestResult } from './backtester';

export type RiskLevel = 'safe' | 'caution' | 'warning' | 'critical';

export interface RiskAssessment {
  level: RiskLevel;
  score: number;       // 0 = no risk, 100 = max risk
  reasons: string[];
  approved: boolean;   // false if critical
  maxCapitalUsd: number;
}

export class RiskAgent {
  private readonly MAX_DRAWDOWN_THRESHOLD = 0.15;   // 15%
  private readonly MIN_TIME_IN_RANGE = 40;          // %
  private readonly MAX_REBALANCES_PER_WEEK = 3;
  private readonly MIN_SHARPE = 0.5;

  assess(
    strategy: StrategyProposal,
    backtest: BacktestResult
  ): RiskAssessment {
    const reasons: string[] = [];
    let riskScore = 0;

    // Drawdown risk
    const drawdownPct = strategy.suggestedCapitalUsd > 0
      ? backtest.maxDrawdown / strategy.suggestedCapitalUsd
      : 0;
    if (drawdownPct > this.MAX_DRAWDOWN_THRESHOLD) {
      riskScore += 30;
      reasons.push(`High drawdown: ${(drawdownPct * 100).toFixed(1)}% > ${this.MAX_DRAWDOWN_THRESHOLD * 100}% threshold`);
    }

    // Time in range risk
    if (backtest.timeInRangePct < this.MIN_TIME_IN_RANGE) {
      riskScore += 25;
      reasons.push(`Low time-in-range: ${backtest.timeInRangePct.toFixed(1)}% < ${this.MIN_TIME_IN_RANGE}% minimum`);
    }

    // Rebalance frequency risk
    const rebalancesPerWeek = backtest.rebalanceCount / Math.max(1, backtest.ticks.length / 7);
    if (rebalancesPerWeek > this.MAX_REBALANCES_PER_WEEK) {
      riskScore += 20;
      reasons.push(`Excessive rebalancing: ${rebalancesPerWeek.toFixed(1)}/week > ${this.MAX_REBALANCES_PER_WEEK} limit`);
    }

    // Sharpe ratio risk
    if (backtest.sharpeRatio < this.MIN_SHARPE) {
      riskScore += 15;
      reasons.push(`Poor risk-adjusted return: Sharpe ${backtest.sharpeRatio.toFixed(2)} < ${this.MIN_SHARPE}`);
    }

    // Profitability risk
    if (!backtest.profitable) {
      riskScore += 20;
      reasons.push('Backtest not profitable in simulation period');
    }

    // Low confidence penalty
    if (strategy.confidence < 40) {
      riskScore += 10;
      reasons.push(`Low strategy confidence: ${strategy.confidence.toFixed(0)}%`);
    }

    riskScore = Math.min(100, riskScore);

    let level: RiskLevel;
    if (riskScore < 20) level = 'safe';
    else if (riskScore < 45) level = 'caution';
    else if (riskScore < 70) level = 'warning';
    else level = 'critical';

    // Scale capital by risk: safe=100%, caution=75%, warning=50%, critical=0
    const capitalScalars: Record<RiskLevel, number> = {
      safe: 1.0,
      caution: 0.75,
      warning: 0.5,
      critical: 0,
    };
    const maxCapitalUsd = strategy.suggestedCapitalUsd * capitalScalars[level];

    return {
      level,
      score: riskScore,
      reasons,
      approved: level !== 'critical',
      maxCapitalUsd,
    };
  }
}

export default RiskAgent;
