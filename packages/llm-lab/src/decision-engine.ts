import type { PoolOpportunity } from './market-analyzer';
import type { StrategyProposal } from './strategy-agent';
import type { RiskAssessment } from './risk-agent';
import type { SimulationResult } from './simulation-lab';

export interface ExecutionDecision {
  approved: boolean;
  confidence: number;
  reason: string;
}

export class DecisionEngine {
  decide(
    opportunity: PoolOpportunity,
    strategy: StrategyProposal,
    risk: RiskAssessment,
    simulation: SimulationResult
  ): ExecutionDecision {
    if (!risk.approved) {
      return {
        approved: false,
        confidence: strategy.confidence,
        reason: 'risk agent rejected proposal',
      };
    }

    if (!simulation.profitable) {
      return {
        approved: false,
        confidence: strategy.confidence,
        reason: 'simulation indicates unprofitable execution',
      };
    }

    return {
      approved: true,
      confidence: strategy.confidence,
      reason: 'approved by strategy, risk, and simulation layers',
    };
  }
}

export default DecisionEngine;
