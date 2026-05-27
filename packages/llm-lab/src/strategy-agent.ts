import type { LLMGateway } from '../../../llm-gateway/src/index';
import type { PoolOpportunity } from './market-analyzer';

export interface StrategyProposal {
  poolAddress: string;
  token0Symbol: string;
  token1Symbol: string;
  recommendedRangeBps: number;
  lowerPricePct: number;
  upperPricePct: number;
  rebalanceThreshold: number;
  suggestedCapitalUsd: number;
  confidence: number;
  rationale: string;
  llmRationale?: string;
  strategyType: 'narrow' | 'medium' | 'wide' | 'full-range';
}

interface RangeConfig {
  rangeBps: number;
  lowerPct: number;
  upperPct: number;
  strategyType: StrategyProposal['strategyType'];
  rebalanceThreshold: number;
}

export class StrategyAgent {
  private deriveRange(volatilityScore: number): RangeConfig {
    if (volatilityScore <= 2) {
      return { rangeBps: 300, lowerPct: 1.5, upperPct: 1.5, strategyType: 'narrow', rebalanceThreshold: 1.0 };
    } else if (volatilityScore <= 4) {
      return { rangeBps: 800, lowerPct: 4, upperPct: 4, strategyType: 'medium', rebalanceThreshold: 2.5 };
    } else if (volatilityScore <= 7) {
      return { rangeBps: 2000, lowerPct: 10, upperPct: 10, strategyType: 'wide', rebalanceThreshold: 7 };
    } else {
      return { rangeBps: 10000, lowerPct: 30, upperPct: 30, strategyType: 'full-range', rebalanceThreshold: 20 };
    }
  }

  generate(opportunity: PoolOpportunity): StrategyProposal {
    const { metrics, feeAnalysis, score } = opportunity;
    const range = this.deriveRange(metrics.volatilityScore);
    const confidence = Math.min(95, Math.max(5, score * 0.95));
    const capitalMultiplier =
      feeAnalysis.efficiency === 'excellent' ? 1.5 :
      feeAnalysis.efficiency === 'good' ? 1.0 :
      feeAnalysis.efficiency === 'fair' ? 0.6 : 0.3;
    const suggestedCapitalUsd = 5000 * capitalMultiplier;
    const rationale = [
      `Strategy: ${range.strategyType} range (\xb1${range.lowerPct}%)`,
      `Fee APR: ${feeAnalysis.feeApr.toFixed(1)}% — Confidence: ${confidence.toFixed(0)}%`,
      `Rebalance trigger: >${range.rebalanceThreshold}% price move`,
    ].join(' | ');
    return {
      poolAddress: metrics.poolAddress,
      token0Symbol: metrics.token0Symbol,
      token1Symbol: metrics.token1Symbol,
      recommendedRangeBps: range.rangeBps,
      lowerPricePct: range.lowerPct,
      upperPricePct: range.upperPct,
      rebalanceThreshold: range.rebalanceThreshold,
      suggestedCapitalUsd,
      confidence,
      rationale,
      strategyType: range.strategyType,
    };
  }

  async generateWithLLM(
    opportunity: PoolOpportunity,
    llm: LLMGateway
  ): Promise<StrategyProposal> {
    const base = this.generate(opportunity);
    const prompt = `You are an LP strategy generator for Uniswap V4.

Pool: ${base.token0Symbol}/${base.token1Symbol}
Strategy: ${base.strategyType} range (\xb1${base.lowerPricePct}%)
Rebalance threshold: ${base.rebalanceThreshold}%
Confidence: ${base.confidence.toFixed(0)}%
Fee APR: ${opportunity.feeAnalysis.feeApr.toFixed(1)}%
Volatility: ${opportunity.volatility.classification}

Generate a concise 2-sentence rationale for this LP strategy.`;
    try {
      const response = await llm.complete({
        model: 'default',
        prompt,
        maxTokens: 100,
        temperature: 0.4,
        systemPrompt: 'You are a DeFi LP strategy engine. Output only the rationale.',
      });
      return { ...base, llmRationale: response.content };
    } catch {
      return base;
    }
  }
}

export default StrategyAgent;
