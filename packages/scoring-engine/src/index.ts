/**
 * @package scoring-engine
 * Scores pools/strategies based on profit, volume, risk, and recency.
 * Produces a ranked list for the strategy-engine to act on.
 */

export interface ScoringWeights {
  profitWeight: number;     // default: 0.35
  volumeWeight: number;     // default: 0.25
  riskWeight: number;       // default: 0.25  (inverted: lower risk = higher score)
  recencyWeight: number;    // default: 0.15
}

export interface ScoringInput {
  poolAddress: string;
  netProfitUsd7d: number;
  volume7dUsd: number;
  riskScore: number;        // 0-1 (lower is better)
  daysSinceLastRebalance: number;
  isActive: boolean;
}

export interface ScoredPool {
  poolAddress: string;
  score: number;            // 0-1 composite score
  breakdown: {
    profit: number;
    volume: number;
    risk: number;
    recency: number;
  };
  rank: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  profitWeight: 0.35,
  volumeWeight: 0.25,
  riskWeight: 0.25,
  recencyWeight: 0.15,
};

/**
 * ScoringEngine — scores and ranks pools by composite performance metric.
 */
export class ScoringEngine {
  private weights: ScoringWeights;

  constructor(weights: Partial<ScoringWeights> = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  scoreAll(inputs: ScoringInput[]): ScoredPool[] {
    const active = inputs.filter((i) => i.isActive);

    // Normalize each dimension across the pool universe
    const maxProfit = Math.max(...active.map((i) => i.netProfitUsd7d), 1);
    const maxVolume = Math.max(...active.map((i) => i.volume7dUsd), 1);
    const maxDays = Math.max(...active.map((i) => i.daysSinceLastRebalance), 1);

    const scored = active.map((input) => {
      const profit = Math.max(input.netProfitUsd7d, 0) / maxProfit;
      const volume = input.volume7dUsd / maxVolume;
      const risk = 1 - input.riskScore; // invert: lower risk = higher component
      const recency = 1 - input.daysSinceLastRebalance / maxDays;

      const score =
        this.weights.profitWeight * profit +
        this.weights.volumeWeight * volume +
        this.weights.riskWeight * risk +
        this.weights.recencyWeight * recency;

      return {
        poolAddress: input.poolAddress,
        score: Math.min(score, 1.0),
        breakdown: { profit, volume, risk, recency },
        rank: 0,
      };
    });

    // Sort descending and assign ranks
    scored.sort((a, b) => b.score - a.score);
    scored.forEach((p, idx) => {
      p.rank = idx + 1;
    });

    return scored;
  }

  scoreOne(input: ScoringInput, universe: ScoringInput[]): ScoredPool {
    const all = this.scoreAll([...universe, input]);
    return all.find((p) => p.poolAddress === input.poolAddress)!;
  }
}

export default ScoringEngine;
