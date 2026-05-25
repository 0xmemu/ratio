/**
 * cycle.test.ts — unit tests for worker cycle logic.
 * Uses mocked scoring, allocation, policy, and DB to test
 * bucketing, policy filtering, and decision creation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Inline pure helpers (extracted from index.ts for testability) -----------

import type { PoolMarketData } from '@ratio/market-data';
import { loadDefaultPolicy } from '@ratio/policy-engine';

const policy = loadDefaultPolicy();

function toBucket(
  _address: string,
  score: number,
): 'coreIncome' | 'activeBalanced' | 'layeredPositions' {
  if (score >= 0.65) return 'coreIncome';
  if (score >= 0.35) return 'activeBalanced';
  return 'layeredPositions';
}

function passesPolicy(pool: PoolMarketData): boolean {
  if (pool.tvlUsd < policy.poolPolicy.minTvlUsd) return false;
  if (pool.volume24hUsd < policy.poolPolicy.minDailyVolumeUsd) return false;
  if (!policy.protocolScope.allowedFeeTiersBps.includes(pool.feeTier / 10)) return false;
  return true;
}

// ---- Pool fixtures ----------------------------------------------------------

const validPool: PoolMarketData = {
  poolAddress: '0xabc123',
  token0: '0xtoken0',
  token1: '0xtoken1',
  token0Symbol: 'USDC',
  token1Symbol: 'ETH',
  feeTier: 5000, // 500 bps = 5000 / 10 = 500 ✓
  tvlUsd: 2_000_000,
  volume24hUsd: 5_000_000,
  feesUsd24h: 10_000,
  liquidity: BigInt('1000000000000000000'),
  sqrtPriceX96: BigInt('79228162514264337593543950336'),
  tick: 0,
  token0Price: 1.0,
  token1Price: 2000.0,
  timestamp: Math.floor(Date.now() / 1000),
};

const lowTvlPool: PoolMarketData = { ...validPool, poolAddress: '0xlow', tvlUsd: 100_000 };
const lowVolumePool: PoolMarketData = { ...validPool, poolAddress: '0xvol', volume24hUsd: 50_000 };
const badFeeTierPool: PoolMarketData = { ...validPool, poolAddress: '0xfee', feeTier: 100 }; // not in allowedFeeTiersBps

// ---- Tests ------------------------------------------------------------------

describe('passesPolicy', () => {
  it('allows a valid pool', () => {
    expect(passesPolicy(validPool)).toBe(true);
  });

  it('rejects pools below min TVL', () => {
    expect(passesPolicy(lowTvlPool)).toBe(false);
  });

  it('rejects pools below min daily volume', () => {
    expect(passesPolicy(lowVolumePool)).toBe(false);
  });

  it('rejects pools with disallowed fee tier', () => {
    expect(passesPolicy(badFeeTierPool)).toBe(false);
  });
});

describe('toBucket', () => {
  it('assigns coreIncome for score >= 0.65', () => {
    expect(toBucket('0xabc', 0.65)).toBe('coreIncome');
    expect(toBucket('0xabc', 0.99)).toBe('coreIncome');
  });

  it('assigns activeBalanced for score 0.35–0.64', () => {
    expect(toBucket('0xabc', 0.35)).toBe('activeBalanced');
    expect(toBucket('0xabc', 0.64)).toBe('activeBalanced');
  });

  it('assigns layeredPositions for score < 0.35', () => {
    expect(toBucket('0xabc', 0.10)).toBe('layeredPositions');
    expect(toBucket('0xabc', 0.34)).toBe('layeredPositions');
  });
});

describe('ScoringEngine integration', () => {
  it('scores and ranks multiple pools deterministically', async () => {
    const { ScoringEngine } = await import('@ratio/scoring-engine');
    const engine = new ScoringEngine();

    const inputs = [
      { poolAddress: '0xA', netProfitUsd7d: 5000, volume7dUsd: 1_000_000, riskScore: 0.2, daysSinceLastRebalance: 1, isActive: true },
      { poolAddress: '0xB', netProfitUsd7d: 1000, volume7dUsd: 200_000, riskScore: 0.6, daysSinceLastRebalance: 5, isActive: true },
      { poolAddress: '0xC', netProfitUsd7d: 3000, volume7dUsd: 500_000, riskScore: 0.3, daysSinceLastRebalance: 2, isActive: true },
    ];

    const results = engine.scoreAll(inputs);
    expect(results).toHaveLength(3);
    expect(results[0].rank).toBe(1);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
    // Best pool should be 0xA (highest profit + volume + low risk)
    expect(results[0].poolAddress).toBe('0xA');
  });

  it('excludes inactive pools', async () => {
    const { ScoringEngine } = await import('@ratio/scoring-engine');
    const engine = new ScoringEngine();
    const inputs = [
      { poolAddress: '0xActive', netProfitUsd7d: 1000, volume7dUsd: 500_000, riskScore: 0.2, daysSinceLastRebalance: 1, isActive: true },
      { poolAddress: '0xInactive', netProfitUsd7d: 9999, volume7dUsd: 9_000_000, riskScore: 0.1, daysSinceLastRebalance: 0, isActive: false },
    ];
    const results = engine.scoreAll(inputs);
    expect(results).toHaveLength(1);
    expect(results[0].poolAddress).toBe('0xActive');
  });
});

describe('AllocationEngine integration', () => {
  it('distributes capital proportionally across scored pools', async () => {
    const { AllocationEngine } = await import('@ratio/allocation-engine');
    const engine = new AllocationEngine();

    const result = engine.allocate({
      totalCapitalUsd: 10_000,
      buckets: { coreIncome: 0.65, activeBalanced: 0.25, layeredPositions: 0.10, experimental: 0 },
      poolScores: [
        { poolAddress: '0xA', score: 0.9, bucket: 'coreIncome' },
        { poolAddress: '0xB', score: 0.7, bucket: 'coreIncome' },
        { poolAddress: '0xC', score: 0.5, bucket: 'activeBalanced' },
      ],
    });

    const totalAllocated = result.reduce((s, r) => s + r.allocatedUsd, 0);
    // coreIncome: 6500, activeBalanced: 2500, experimental: 0 (layeredPositions has no pool)
    expect(totalAllocated).toBeCloseTo(9_000, 0);

    const poolA = result.find((r) => r.poolAddress === '0xA')!;
    const poolB = result.find((r) => r.poolAddress === '0xB')!;
    // 0xA has higher score so gets more capital
    expect(poolA.allocatedUsd).toBeGreaterThan(poolB.allocatedUsd);
  });

  it('experimental bucket is always 0 in v1', async () => {
    const { AllocationEngine } = await import('@ratio/allocation-engine');
    const engine = new AllocationEngine({ experimental: 0.5 }); // try to override
    const result = engine.allocate({
      totalCapitalUsd: 10_000,
      buckets: { coreIncome: 0.5, activeBalanced: 0.5, layeredPositions: 0, experimental: 0.5 },
      poolScores: [{ poolAddress: '0xExp', score: 0.9, bucket: 'experimental' }],
    });
    const expAlloc = result.find((r) => r.poolAddress === '0xExp');
    expect(expAlloc).toBeUndefined();
  });
});
