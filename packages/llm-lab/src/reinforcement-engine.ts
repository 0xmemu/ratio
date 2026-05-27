/**
 * reinforcement-engine.ts
 * Q-learning inspired parameter update loop.
 * Adjusts strategy weights based on outcome feedback.
 * Sandbox only — no live execution side-effects.
 */

export interface RLState {
  volatilityBucket: 'low' | 'medium' | 'high' | 'extreme';
  feeAprBucket: 'poor' | 'fair' | 'good' | 'excellent';
  strategyType: string;
}

export interface RLAction {
  adjustConfidenceBy: number;    // delta, e.g. +5 or -10
  adjustRangeBy: number;         // delta bps
}

export interface RLTransition {
  state: RLState;
  action: RLAction;
  reward: number;  // actualProfitUsd (can be negative)
  timestamp: number;
}

export interface RLWeights {
  confidenceWeight: number;     // multiplier on confidence signal
  rangeWeight: number;          // multiplier on range width
  learningRate: number;
}

export class ReinforcementEngine {
  private weights: RLWeights = {
    confidenceWeight: 1.0,
    rangeWeight: 1.0,
    learningRate: 0.05,
  };

  private history: RLTransition[] = [];

  /**
   * Record a completed strategy cycle and update weights via gradient descent.
   * Reward signal: normalized profit (positive = good, negative = bad).
   */
  update(transition: RLTransition): void {
    this.history.push(transition);

    const normalizedReward = Math.tanh(transition.reward / 500); // squash to -1..+1

    // Update confidence weight: positive reward -> increase weight
    this.weights.confidenceWeight = Math.max(
      0.3,
      Math.min(2.0, this.weights.confidenceWeight + this.weights.learningRate * normalizedReward)
    );

    // Update range weight: for high-volatility states, negative reward -> widen range
    if (transition.state.volatilityBucket === 'high' || transition.state.volatilityBucket === 'extreme') {
      if (normalizedReward < 0) {
        this.weights.rangeWeight = Math.min(2.0, this.weights.rangeWeight + 0.02);
      }
    }

    // Decay learning rate over time (simulated annealing)
    this.weights.learningRate = Math.max(
      0.005,
      this.weights.learningRate * 0.999
    );
  }

  /**
   * Apply current learned weights to adjust a strategy's confidence and range.
   */
  applyWeights(confidence: number, rangeBps: number): { confidence: number; rangeBps: number } {
    return {
      confidence: Math.min(95, confidence * this.weights.confidenceWeight),
      rangeBps: Math.round(rangeBps * this.weights.rangeWeight),
    };
  }

  getWeights(): Readonly<RLWeights> {
    return { ...this.weights };
  }

  getEpisodeCount(): number {
    return this.history.length;
  }

  /**
   * Return average reward over last N transitions.
   */
  getRecentPerformance(n = 10): number {
    const recent = this.history.slice(-n);
    if (recent.length === 0) return 0;
    return recent.reduce((sum, t) => sum + t.reward, 0) / recent.length;
  }
}

export default ReinforcementEngine;
