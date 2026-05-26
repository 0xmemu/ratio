import type { StrategyProposal } from './strategy-agent';

export interface PolicyDecision {
  allowed: boolean;
  violations: string[];
}

export interface PolicyConfig {
  maxPositionUsd: number;
  maxRangeBps: number;
  minimumConfidence: number;
}

export class PolicyEngine {
  constructor(private config: PolicyConfig) {}

  evaluate(strategy: StrategyProposal): PolicyDecision {
    const violations: string[] = [];

    if (strategy.confidence < this.config.minimumConfidence) {
      violations.push('strategy confidence below minimum');
    }

    if (strategy.recommendedRangeBps > this.config.maxRangeBps) {
      violations.push('recommended range exceeds limit');
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }
}

export default PolicyEngine;
