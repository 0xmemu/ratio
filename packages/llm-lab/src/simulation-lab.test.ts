import { describe, it, expect } from 'vitest';
import { SimulationLab } from './simulation-lab';
import type { SimulationInput } from './simulation-lab';
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

const makeInput = (overrides: Partial<SimulationInput> = {}): SimulationInput => ({
  initialCapitalUsd: 5000,
  estimatedApr: 0.25,
  gasCostUsd: 15,
  rebalanceFrequencyPerMonth: 4,
  holdingPeriodDays: 365,
  ...overrides,
});

describe('SimulationLab', () => {
  const lab = new SimulationLab();

  it('computes profitable simulation for good APR', () => {
    const result = lab.simulate(makeStrategy(), makeInput({ estimatedApr: 0.5 }));
    expect(result.profitable).toBe(true);
    expect(result.projectedMonthlyProfitUsd).toBeGreaterThan(0);
    expect(result.roi).toBeGreaterThan(0);
  });

  it('computes unprofitable simulation for low APR', () => {
    const result = lab.simulate(makeStrategy(), makeInput({ estimatedApr: 0.01 }));
    expect(result.profitable).toBe(false);
  });

  it('adjusts effective APR by confidence', () => {
    const highConf = lab.simulate(makeStrategy({ confidence: 90 }), makeInput({ estimatedApr: 0.5 }));
    const lowConf = lab.simulate(makeStrategy({ confidence: 30 }), makeInput({ estimatedApr: 0.5 }));
    expect(highConf.projectedMonthlyProfitUsd).toBeGreaterThan(lowConf.projectedMonthlyProfitUsd);
  });

  it('computes break-even days', () => {
    const result = lab.simulate(makeStrategy(), makeInput({ estimatedApr: 0.5 }));
    expect(result.breakEvenDays).toBeGreaterThan(0);
    expect(isFinite(result.breakEvenDays)).toBe(true);
  });

  it('break-even is Infinity when unprofitable', () => {
    const result = lab.simulate(makeStrategy(), makeInput({ estimatedApr: 0.001 }));
    expect(result.breakEvenDays).toBe(Infinity);
  });

  it('runScenarios returns bull/base/bear analysis', () => {
    const result = lab.runScenarios(makeStrategy(), makeInput({ estimatedApr: 0.3 }));
    expect(result.base).toBeDefined();
    expect(result.bull).toBeDefined();
    expect(result.bear).toBeDefined();
    expect(result.recommendation).toBeTruthy();
  });

  it('bull scenario is better than bear', () => {
    const result = lab.runScenarios(makeStrategy(), makeInput({ estimatedApr: 0.4 }));
    expect(result.bull.projectedAnnualProfitUsd).toBeGreaterThan(result.bear.projectedAnnualProfitUsd);
  });

  it('strong signal when all scenarios profitable', () => {
    const result = lab.runScenarios(makeStrategy(), makeInput({ estimatedApr: 1.0 }));
    expect(result.recommendation).toContain('Strong signal');
  });

  it('weak signal when only bull profitable', () => {
    const result = lab.runScenarios(makeStrategy(), makeInput({ estimatedApr: 0.02 }));
    expect(result.recommendation).toContain('Weak');
  });
});
