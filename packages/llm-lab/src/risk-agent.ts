import type { StrategyProposal } from './strategy-agent';

export interface RiskAssessment {
  approved: boolean;
  riskScore: number;
  warnings: string[];
}

export class RiskAgent {
  evaluate(strategy: StrategyProposal): RiskAssessment {
    const warnings: string[] = [];

    if (strategy.confidence < 40) {
      warnings.push('low confidence strategy');
    }

    if (strategy.recommendedRangeBps > 2000) {
      warnings.push('wide LP range increases exposure');
    }

    const riskScore = Math.max(0, 100 - strategy.confidence);

    return {
      approved: warnings.length < 2,
      riskScore,
      warnings,
    };
  }
}

export default RiskAgent;
