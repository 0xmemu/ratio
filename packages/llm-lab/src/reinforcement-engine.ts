import type { StrategyMemory } from './vector-memory';

export interface ReinforcementUpdate {
  strategyId: string;
  rewardScore: number;
  updatedPerformance: number;
}

export class ReinforcementEngine {
  update(memory: StrategyMemory, reward: number): ReinforcementUpdate {
    const updatedPerformance =
      memory.performanceScore * 0.8 + reward * 0.2;

    return {
      strategyId: memory.id,
      rewardScore: reward,
      updatedPerformance,
    };
  }
}

export default ReinforcementEngine;
