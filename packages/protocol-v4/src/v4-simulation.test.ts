import { describe, it, expect } from 'vitest';
import { V4Simulator } from './v4-simulation';
import type { V4PoolDiscovery } from './v4-discovery';
import type { HookClassification } from './hook-classifier';
import type { HookFlags } from './index';

const emptyFlags = (): HookFlags => ({
  beforeInitialize: false, afterInitialize: false,
  beforeAddLiquidity: false, afterAddLiquidity: false,
  beforeRemoveLiquidity: false, afterRemoveLiquidity: false,
  beforeSwap: false, afterSwap: false,
  beforeDonate: false, afterDonate: false,
});

const makePool = (overrides: Partial<V4PoolDiscovery> = {}): V4PoolDiscovery => ({
  poolId: '0xpool1',
  poolKey: { currency0: 'ETH', currency1: 'USDC', fee: 3000, tickSpacing: 60, hooks: '0xhook1' },
  hook: { address: '0xhook1', flags: emptyFlags(), trustLevel: 'unknown', riskScore: 0.5 },
  tvlUsd: 1_000_000,
  volume24h: 500_000,
  createdAt: Date.now(),
  feeTier: 3000,
  tickSpacing: 60,
  isActive: true,
  ...overrides,
});

const makeHookClass = (overrides: Partial<HookClassification> = {}): HookClassification => ({
  address: '0xhook1',
  category: 'passive',
  flags: emptyFlags(),
  trustLevel: 'unknown',
  riskScore: 0.1,
  reasons: [],
  hasUpgradeProxy: false,
  hasOwnerPause: false,
  isImmutable: true,
  ...overrides,
});

const baseInput = {
  initialCapitalUsd: 10_000,
  rangeWidthBps: 2000,
  holdingPeriodDays: 30,
  estimatedApr: 20,
  gasCostUsd: 15,
};

describe('V4Simulator', () => {
  const sim = new V4Simulator();

  it('returns strong for low-risk passive hook', () => {
    const result = sim.simulate({ pool: makePool(), hookClass: makeHookClass(), ...baseInput });
    expect(result.recommendation).toBe('strong');
    expect(result.riskMultiplier).toBe(1.0);
    expect(result.adjustedApr).toBeCloseTo(20, 0);
  });

  it('applies risk haircut for high-risk hooks', () => {
    const result = sim.simulate({
      pool: makePool(),
      hookClass: makeHookClass({ riskScore: 0.7, category: 'complex' }),
      ...baseInput,
    });
    expect(result.riskMultiplier).toBeLessThan(0.5);
    expect(result.adjustedApr).toBeLessThan(10);
  });

  it('flags avoid for liquidity gating hooks', () => {
    const flags: HookFlags = { ...emptyFlags(), beforeAddLiquidity: true, beforeRemoveLiquidity: true };
    const result = sim.simulate({
      pool: makePool(),
      hookClass: makeHookClass({ flags, riskScore: 0.4 }),
      ...baseInput,
    });
    expect(result.recommendation).toBe('avoid');
    expect(result.liquidityGateRisk).toBe(true);
  });

  it('detects MEV risk from swap hooks', () => {
    const flags: HookFlags = { ...emptyFlags(), beforeSwap: true };
    const result = sim.simulate({
      pool: makePool(),
      hookClass: makeHookClass({ flags }),
      ...baseInput,
    });
    expect(result.hookMevRiskPct).toBeGreaterThan(0);
  });

  it('avoid for low TVL pools', () => {
    const result = sim.simulate({
      pool: makePool({ tvlUsd: 100_000 }),
      hookClass: makeHookClass({ riskScore: 0.1 }),
      ...baseInput,
    });
    expect(result.recommendation).toBe('avoid');
  });

  it('fee manipulation hooks get fee drag', () => {
    const result = sim.simulate({
      pool: makePool(),
      hookClass: makeHookClass({ category: 'fee_manipulation', riskScore: 0.5 }),
      ...baseInput,
    });
    expect(result.feeDragPct).toBeGreaterThan(0);
  });

  it('upgradeable proxy reduces risk multiplier', () => {
    const result = sim.simulate({
      pool: makePool(),
      hookClass: makeHookClass({ hasUpgradeProxy: true }),
      ...baseInput,
    });
    expect(result.riskMultiplier).toBeLessThan(1.0);
  });

  it('simulateAll returns summary stats', () => {
    const pools: V4PoolDiscovery[] = [
      makePool({ poolId: '0xgood' }),
      makePool({ poolId: '0xrisky', poolKey: { ...makePool().poolKey, hooks: '0xhook2' } }),
    ];
    const hookClasses: HookClassification[] = [
      makeHookClass({ address: '0xhook1', riskScore: 0.05 }),
      makeHookClass({ address: '0xhook2', riskScore: 0.85, category: 'complex' }),
    ];
    const summary = sim.simulateAll(pools, hookClasses, baseInput);
    expect(summary.results).toHaveLength(2);
    expect(summary.totalProfitable).toBeGreaterThanOrEqual(0);
    expect(summary.avgAdjustedApr).toBeGreaterThan(0);
    expect(summary.mostRiskyHook).toBe('0xhook2');
  });
});
