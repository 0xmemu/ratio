import type { VectorMemory, SimilarStrategy } from './vector-memory';

export interface PerformanceRecord {
  id: string;
  poolAddress: string;
  strategyType: string;
  feeApr: number;
  volatilityScore: number;
  confidence: number;
  outcome: 'profitable' | 'loss' | 'unknown';
  actualProfitUsd: number;
  timestamp: number;
}

export interface PerformanceSummary {
  totalRecords: number;
  winRate: number;            // 0-100%
  avgProfitUsd: number;
  avgLossUsd: number;
  bestStrategyType: string;
  avgFeeAprOnWins: number;
  insights: string[];
}

export class PerformanceRecall {
  private records: PerformanceRecord[] = [];

  record(entry: PerformanceRecord): void {
    this.records.push(entry);
  }

  getSummary(): PerformanceSummary {
    if (this.records.length === 0) {
      return {
        totalRecords: 0,
        winRate: 0,
        avgProfitUsd: 0,
        avgLossUsd: 0,
        bestStrategyType: 'unknown',
        avgFeeAprOnWins: 0,
        insights: ['No historical data available yet'],
      };
    }

    const wins = this.records.filter((r) => r.outcome === 'profitable');
    const losses = this.records.filter((r) => r.outcome === 'loss');

    const winRate = (wins.length / this.records.length) * 100;
    const avgProfitUsd = wins.length > 0
      ? wins.reduce((s, r) => s + r.actualProfitUsd, 0) / wins.length
      : 0;
    const avgLossUsd = losses.length > 0
      ? Math.abs(losses.reduce((s, r) => s + r.actualProfitUsd, 0)) / losses.length
      : 0;

    // Find best strategy type by win rate
    const typeGroups = this.records.reduce<Record<string, { wins: number; total: number }>>(
      (acc, r) => {
        if (!acc[r.strategyType]) acc[r.strategyType] = { wins: 0, total: 0 };
        acc[r.strategyType].total++;
        if (r.outcome === 'profitable') acc[r.strategyType].wins++;
        return acc;
      },
      {}
    );
    const bestStrategyType = Object.entries(typeGroups)
      .sort((a, b) => b[1].wins / b[1].total - a[1].wins / a[1].total)[0]?.[0] ?? 'unknown';

    const avgFeeAprOnWins = wins.length > 0
      ? wins.reduce((s, r) => s + r.feeApr, 0) / wins.length
      : 0;

    const insights: string[] = [];
    if (winRate > 70) insights.push(`Strong win rate: ${winRate.toFixed(1)}%`);
    if (winRate < 40) insights.push(`Low win rate: ${winRate.toFixed(1)}% — review strategy parameters`);
    if (avgFeeAprOnWins > 30) insights.push(`Winning strategies averaged ${avgFeeAprOnWins.toFixed(1)}% APR`);
    if (bestStrategyType !== 'unknown') insights.push(`Best performing range type: ${bestStrategyType}`);
    if (insights.length === 0) insights.push('Insufficient data for insights');

    return { totalRecords: this.records.length, winRate, avgProfitUsd, avgLossUsd, bestStrategyType, avgFeeAprOnWins, insights };
  }

  recallSimilar(
    memory: VectorMemory,
    queryVector: number[],
    topK = 5
  ): SimilarStrategy[] {
    return memory.query(queryVector, topK);
  }

  /**
   * Get confidence adjustment based on past performance with similar strategies.
   * Returns a multiplier 0.5–1.5 to apply to strategy confidence.
   */
  getConfidenceAdjustment(similar: SimilarStrategy[]): number {
    if (similar.length === 0) return 1.0;
    const profitableCount = similar.filter(
      (s) => s.embedding.metadata.outcome === 'profitable'
    ).length;
    const winRate = profitableCount / similar.length;
    // Win rate 100% -> 1.5x, 50% -> 1.0x, 0% -> 0.5x
    return 0.5 + winRate;
  }
}

export default PerformanceRecall;
