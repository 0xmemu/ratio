import type { PoolOpportunity } from './market-analyzer';
import type { StrategyProposal } from './strategy-agent';
import type { BacktestResult } from './backtester';
import type { RiskAssessment } from './risk-agent';
import type { LLMGateway } from '../../../llm-gateway/src/index';

export type DecisionAction = 'enter' | 'skip' | 'hold' | 'exit';

export interface DecisionSignal {
  source: string;
  weight: number;
  value: number;   // -1 to +1
}

export interface Decision {
  action: DecisionAction;
  finalScore: number;  // -100 to +100
  signals: DecisionSignal[];
  summary: string;
  llmReasoning?: string;
}

export class DecisionEngine {
  /**
   * Aggregate multiple weighted signals into a final decision.
   * Score > 40  -> enter
   * Score 10-40 -> hold (already in position)
   * Score < 10  -> skip
   * Score < -20 -> exit
   */
  decide(
    opportunity: PoolOpportunity,
    strategy: StrategyProposal,
    backtest: BacktestResult,
    risk: RiskAssessment
  ): Decision {
    const signals: DecisionSignal[] = [
      {
        source: 'opportunity_score',
        weight: 0.30,
        value: (opportunity.score - 50) / 50, // normalize 0-100 to -1..+1
      },
      {
        source: 'strategy_confidence',
        weight: 0.25,
        value: (strategy.confidence - 50) / 50,
      },
      {
        source: 'backtest_profitable',
        weight: 0.20,
        value: backtest.profitable ? 1 : -1,
      },
      {
        source: 'risk_approval',
        weight: 0.15,
        value: risk.approved ? (risk.level === 'safe' ? 1 : risk.level === 'caution' ? 0.3 : -0.5) : -1,
      },
      {
        source: 'sharpe_ratio',
        weight: 0.10,
        value: Math.min(1, Math.max(-1, (backtest.sharpeRatio - 1) / 2)),
      },
    ];

    const finalScore =
      signals.reduce((sum, s) => sum + s.weight * s.value, 0) * 100;

    let action: DecisionAction;
    if (finalScore > 40) action = 'enter';
    else if (finalScore > 10) action = 'hold';
    else if (finalScore > -20) action = 'skip';
    else action = 'exit';

    // Override: never enter when risk is critical
    if (!risk.approved && action === 'enter') action = 'skip';

    const summary = [
      `Action: ${action.toUpperCase()} (score: ${finalScore.toFixed(1)})`,
      `Risk: ${risk.level} | Strategy: ${strategy.strategyType}`,
      `Signals: ${signals.map((s) => `${s.source}=${(s.value * s.weight * 100).toFixed(1)}`).join(', ')}`,
    ].join(' | ');

    return { action, finalScore, signals, summary };
  }

  async decideWithLLM(
    opportunity: PoolOpportunity,
    strategy: StrategyProposal,
    backtest: BacktestResult,
    risk: RiskAssessment,
    llm: LLMGateway
  ): Promise<Decision> {
    const base = this.decide(opportunity, strategy, backtest, risk);
    const prompt = `You are a DeFi LP decision engine for Uniswap V4.

Opportunity score: ${opportunity.score.toFixed(1)}/100
Strategy: ${strategy.strategyType} range, confidence ${strategy.confidence.toFixed(0)}%
Backtest: profitable=${backtest.profitable}, Sharpe=${backtest.sharpeRatio.toFixed(2)}, time-in-range=${backtest.timeInRangePct.toFixed(1)}%
Risk level: ${risk.level} (score ${risk.score})
Decision engine verdict: ${base.action.toUpperCase()} (score ${base.finalScore.toFixed(1)})

Provide a 2-sentence justification for this LP decision.`;
    try {
      const response = await llm.complete({
        model: 'default',
        prompt,
        maxTokens: 100,
        temperature: 0.3,
        systemPrompt: 'You are a DeFi decision engine. Be concise, data-driven.',
      });
      return { ...base, llmReasoning: response.content };
    } catch {
      return base;
    }
  }
}

export default DecisionEngine;
