import type { PoolOpportunity } from './market-analyzer';

export interface StrategyProposal {
  poolAddress: string;
  recommendedRangeBps: number;
  rebalanceThreshold: number;
  confidence: number;
  rationale: string;
}

export class StrategyAgent {
  generate(opportunity: PoolOpportunity): StrategyProposal {
    const confidence = Math.max(
      0,
      Math.min(100, opportunity.score)
    );

    return {
      poolAddress: opportunity.metrics.poolAddress,
      recommendedRangeBps: opportunity.metrics.volatilityScore > 7
        ? 1500
        : 500,
      rebalanceThreshold: opportunity.metrics.volatilityScore > 7
        ? 10
        : 5,
      confidence,
      rationale: 'strategy generated from market opportunity score',
    };
  }
}

export default StrategyAgent;
