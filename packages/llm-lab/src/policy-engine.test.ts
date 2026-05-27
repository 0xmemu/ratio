import { describe, it, expect } from 'vitest';
import { PolicyEngine } from './policy-engine';
import type { StrategyProposal } from './strategy-agent';

const makeStrategy = (overrides: Partial<StrategyProposal> = {}): StrategyProposal => ({
  poolAddress: '0xpool1',
  token0Symbol: 'ETH',
  token1Symbol: 'USDC',
  recommendedRangeBps: 800,
  lowerPricePct: 4,
  upperPricePct: 4,
  rebalanceThreshold: 2.5,
  suggestedCapitalUsd: 5000,
  confidence: 75,
  rationale: 'test',
  strategyType: 'medium',
  ...overrides,
});

describe('PolicyEngine', () => {
  const config = {
    maxPositionUsd: 10000,
    maxRangeBps: 5000,
    minimumConfidence: 50,
  };

  it('allows strategy meeting all criteria', () => {
    const engine = new PolicyEngine(config);
    const result = engine.evaluate(makeStrategy());
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('violates minimum confidence', () => {
    const engine = new PolicyEngine(config);
    const result = engine.evaluate(makeStrategy({ confidence: 30 }));
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain('strategy confidence below minimum');
  });

  it('violates max range bps', () => {
    const engine = new PolicyEngine(config);
    const result = engine.evaluate(makeStrategy({ recommendedRangeBps: 10000 }));
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain('recommended range exceeds limit');
  });

  it('reports multiple violations', () => {
    const engine = new PolicyEngine(config);
    const result = engine.evaluate(
      makeStrategy({ confidence: 10, recommendedRangeBps: 20000 }),
    );
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });

  it('tight config blocks borderline strategies', () => {
    const tight = new PolicyEngine({ ...config, minimumConfidence: 80, maxRangeBps: 500 });
    const result = tight.evaluate(makeStrategy());
    expect(result.allowed).toBe(false);
  });
});
