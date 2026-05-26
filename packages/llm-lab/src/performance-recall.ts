import type { StrategyMemory } from './vector-memory';

export interface PerformanceInsight {
  averagePerformance: number;
  bestPool?: string;
  worstPool?: string;
  totalStrategies: number;
}

export class PerformanceRecall {
  summarize(memories: StrategyMemory[]): PerformanceInsight {
    if (memories.length === 0) {
      return {
        averagePerformance: 0,
        totalStrategies: 0,
      };
    }

    const averagePerformance =
      memories.reduce((sum, memory) => {
        return sum + memory.performanceScore;
      }, 0) / memories.length;

    const sorted = [...memories].sort(
      (a, b) => b.performanceScore - a.performanceScore
    );

    return {
      averagePerformance,
      bestPool: sorted[0]?.poolAddress,
      worstPool: sorted[sorted.length - 1]?.poolAddress,
      totalStrategies: memories.length,
    };
  }
}

export default PerformanceRecall;
