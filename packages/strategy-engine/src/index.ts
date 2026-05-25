/**
 * @package strategy-engine
 * Selects and manages strategy lifecycle: which pools to enter,
 * when to rebalance, and when to exit.
 * All live decisions require policy-engine approval.
 */

export type StrategyAction = 'enter' | 'rebalance' | 'exit' | 'hold';

export interface StrategyDecision {
  poolAddress: string;
  action: StrategyAction;
  tickLower: number;
  tickUpper: number;
  capitalUsd: number;
  reason: string;
  confidence: number;
  requiresApproval: boolean; // always true for live mode
}

export interface StrategyConfig {
  minNetProfitUsd: number;      // v1: 100
  evaluationWindowDays: number; // v1: 7
  dryRun: boolean;              // v1 default: true
  capitalSplits: {
    coreIncome: number;         // 0.65
    activeBalanced: number;     // 0.25
    layeredPositions: number;   // 0.10
    experimental: number;       // 0.00
  };
}

const DEFAULT_CONFIG: StrategyConfig = {
  minNetProfitUsd: 100,
  evaluationWindowDays: 7,
  dryRun: true,
  capitalSplits: {
    coreIncome: 0.65,
    activeBalanced: 0.25,
    layeredPositions: 0.10,
    experimental: 0.00,
  },
};

/**
 * StrategyEngine — orchestrates pool selection and position management.
 * Dry-run by default; live mode requires explicit env flag + policy gate.
 */
export class StrategyEngine {
  private config: StrategyConfig;

  constructor(config: Partial<StrategyConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      capitalSplits: {
        ...DEFAULT_CONFIG.capitalSplits,
        ...(config.capitalSplits ?? {}),
      },
    };
  }

  /**
   * Evaluate a scored pool and decide the appropriate action.
   * Returns a StrategyDecision that must pass through policy-engine before execution.
   */
  evaluate(params: {
    poolAddress: string;
    score: number;
    currentPositionValueUsd: number;
    netProfitUsd7d: number;
    currentTickLower: number;
    currentTickUpper: number;
    optimalTickLower: number;
    optimalTickUpper: number;
    hasPosition: boolean;
  }): StrategyDecision {
    const {
      poolAddress,
      score,
      currentPositionValueUsd,
      netProfitUsd7d,
      currentTickLower,
      currentTickUpper,
      optimalTickLower,
      optimalTickUpper,
      hasPosition,
    } = params;

    // Exit condition: negative profit below threshold
    if (hasPosition && netProfitUsd7d < -this.config.minNetProfitUsd) {
      return {
        poolAddress,
        action: 'exit',
        tickLower: currentTickLower,
        tickUpper: currentTickUpper,
        capitalUsd: currentPositionValueUsd,
        reason: 'net_profit_below_threshold',
        confidence: 0.9,
        requiresApproval: true,
      };
    }

    // Rebalance if tick range has drifted
    if (
      hasPosition &&
      (currentTickLower !== optimalTickLower || currentTickUpper !== optimalTickUpper)
    ) {
      return {
        poolAddress,
        action: 'rebalance',
        tickLower: optimalTickLower,
        tickUpper: optimalTickUpper,
        capitalUsd: currentPositionValueUsd,
        reason: 'tick_range_drift',
        confidence: score,
        requiresApproval: true,
      };
    }

    // Enter new position if score is high enough and no position yet
    if (!hasPosition && score >= 0.6) {
      const capitalUsd =
        this.config.capitalSplits.coreIncome * currentPositionValueUsd;
      return {
        poolAddress,
        action: 'enter',
        tickLower: optimalTickLower,
        tickUpper: optimalTickUpper,
        capitalUsd,
        reason: 'high_score_no_position',
        confidence: score,
        requiresApproval: true,
      };
    }

    return {
      poolAddress,
      action: 'hold',
      tickLower: currentTickLower,
      tickUpper: currentTickUpper,
      capitalUsd: currentPositionValueUsd,
      reason: 'no_action_needed',
      confidence: score,
      requiresApproval: false,
    };
  }

  isDryRun(): boolean {
    return this.config.dryRun;
  }
}

export default StrategyEngine;
