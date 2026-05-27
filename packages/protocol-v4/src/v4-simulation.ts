/**
 * v4-simulation.ts
 * Simulates LP positions on Uniswap v4 pools with hooks.
 * Models hook-induced MEV, fee adjustments, and liquidity restrictions.
 * SIMULATION MODE ONLY — no execution.
 */

import type { HookClassification } from './hook-classifier';
import type { V4PoolDiscovery } from './v4-discovery';

export interface V4SimulationInput {
  pool: V4PoolDiscovery;
  hookClass: HookClassification;
  initialCapitalUsd: number;
  rangeWidthBps: number;
  holdingPeriodDays: number;
  estimatedApr: number;
  gasCostUsd: number;
}

export interface V4SimulationResult {
  poolId: string;
  hookAddress: string;
  projectedProfitUsd: number;
  adjustedApr: number;
  riskMultiplier: number;
  feeDragPct: number;
  hookMevRiskPct: number;
  liquidityGateRisk: boolean;
  recommendation: 'strong' | 'moderate' | 'weak' | 'avoid';
  reasons: string[];
}

export interface V4SimulationSummary {
  results: V4SimulationResult[];
  totalProfitable: number;
  avgAdjustedApr: number;
  mostRiskyHook: string;
  scoredAt: number;
}

export class V4Simulator {
  /**
   * Simulate a single v4 LP position.
   */
  simulate(input: V4SimulationInput): V4SimulationResult {
    const reasons: string[] = [];
    let riskMultiplier = 1.0;
    let feeDragPct = 0;
    let hookMevRiskPct = 0;
    let liquidityGateRisk = false;

    const { pool, hookClass } = input;

    // 1. Hook risk adjustment
    if (hookClass.riskScore > 0.6) {
      riskMultiplier *= 0.3;
      reasons.push(
        `high risk hook (score ${hookClass.riskScore}) — 70% capital haircut`
      );
    } else if (hookClass.riskScore > 0.3) {
      riskMultiplier *= 0.7;
      reasons.push(
        `moderate risk hook (score ${hookClass.riskScore}) — 30% capital haircut`
      );
    }

    // 2. Fee drag from hook-based fee manipulation
    if (hookClass.category === 'fee_manipulation') {
      feeDragPct = 15;
      riskMultiplier *= 0.6;
      reasons.push('hook category: fee manipulation — 15% fee drag');
    }

    // 3. MEV risk from swap interception
    if (hookClass.flags.beforeSwap || hookClass.flags.afterSwap) {
      hookMevRiskPct = hookClass.flags.beforeSwap && hookClass.flags.afterSwap ? 20 : 10;
      riskMultiplier *= hookClass.flags.beforeSwap && hookClass.flags.afterSwap ? 0.7 : 0.85;
      reasons.push(
        `swap interception hooks active — ${hookMevRiskPct}% MEV risk`
      );
    }

    // 4. Liquidity gate risk
    if (
      hookClass.flags.beforeAddLiquidity ||
      hookClass.flags.beforeRemoveLiquidity
    ) {
      liquidityGateRisk = true;
      riskMultiplier *= 0.5;
      reasons.push('liquidity gating hooks — possible entry/exit restrictions');
    }

    // 5. Upgrade proxy / owner pause
    if (hookClass.hasUpgradeProxy) {
      riskMultiplier *= 0.7;
      reasons.push('upgradeable proxy — hook logic may change');
    }
    if (hookClass.hasOwnerPause) {
      riskMultiplier *= 0.8;
      reasons.push('owner pause — liquidity may be frozen');
    }

    // Calculate projected profit
    const adjustedApr = input.estimatedApr * riskMultiplier - feeDragPct;
    const projectedProfitUsd =
      (input.initialCapitalUsd * (adjustedApr / 100) * input.holdingPeriodDays) /
      365 -
      input.gasCostUsd * 2;

    // Recommendation
    let recommendation: V4SimulationResult['recommendation'];
    if (hookClass.riskScore > 0.8 || liquidityGateRisk) {
      recommendation = 'avoid';
    } else if (adjustedApr > 15 && hookClass.riskScore < 0.3) {
      recommendation = 'strong';
    } else if (adjustedApr > 8) {
      recommendation = 'moderate';
    } else if (adjustedApr > 2) {
      recommendation = 'weak';
    } else {
      recommendation = 'avoid';
    }

    if (pool.tvlUsd < 500_000) {
      recommendation = 'avoid';
      reasons.push('TVL below $500k — insufficient liquidity depth for v4');
    }

    return {
      poolId: pool.poolId,
      hookAddress: pool.poolKey.hooks,
      projectedProfitUsd: Math.round(projectedProfitUsd * 100) / 100,
      adjustedApr: Math.round(adjustedApr * 100) / 100,
      riskMultiplier: Math.round(riskMultiplier * 100) / 100,
      feeDragPct: Math.round(feeDragPct * 100) / 100,
      hookMevRiskPct: Math.round(hookMevRiskPct * 100) / 100,
      liquidityGateRisk,
      recommendation,
      reasons,
    };
  }

  /**
   * Batch simulate all discovered pools.
   */
  simulateAll(
    pools: V4PoolDiscovery[],
    hookClasses: HookClassification[],
    baseInput: {
      initialCapitalUsd: number;
      rangeWidthBps: number;
      holdingPeriodDays: number;
      estimatedApr: number;
      gasCostUsd: number;
    }
  ): V4SimulationSummary {
    const hookMap = new Map(
      hookClasses.map((h) => [h.address.toLowerCase(), h])
    );

    const results: V4SimulationResult[] = [];
    let totalProfitable = 0;
    let totalAdjustedApr = 0;
    let mostRiskyHook = '';
    let highestRisk = 0;

    for (const pool of pools) {
      const hookClass = hookMap.get(pool.poolKey.hooks.toLowerCase());
      if (!hookClass) continue;

      const result = this.simulate({
        pool,
        hookClass,
        ...baseInput,
      });

      results.push(result);
      totalAdjustedApr += result.adjustedApr;

      if (result.recommendation !== 'avoid') totalProfitable++;

      if (hookClass.riskScore > highestRisk) {
        highestRisk = hookClass.riskScore;
        mostRiskyHook = hookClass.address;
      }
    }

    return {
      results,
      totalProfitable,
      avgAdjustedApr:
        results.length > 0 ? totalAdjustedApr / results.length : 0,
      mostRiskyHook,
      scoredAt: Date.now(),
    };
  }
}

export default V4Simulator;
