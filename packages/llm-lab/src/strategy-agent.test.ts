import { describe, it, expect } from 'vitest';
import { StrategyAgent } from './strategy-agent';
import type { PoolOpportunity } from './market-analyzer';

const makeOpportunity = (overrides: Partial<PoolOpportunity> = {}): PoolOpportunity => ({
  score: 70,
  reason: 'test',
  volatility: {
    score: 3,
    classification: 'medium',
    avgPriceDeviationPct: 0.9,
    recommendation: 'test',
  },
  feeAnalysis: {
    feeApr: 25,
    feeDensity: 0.5,
    efficiency: 'good',
  },
  metrics: {
    poolAddress: '0xpool1',
    token0Symbol: 'ETH',
    token1Symbol: 'USDC',
    feeTier: 500,
    volume24h: 1_000_000,
    fees24h: 500,
    liquidityUsd: 5_000_000,
    volatilityScore: 3,
    timestamp: Date.now(),
  },
  ...overrides,
});

describe('StrategyAgent', () => {
  const agent = new StrategyAgent();

  it('derives narrow range for low volatility', () => {
    const opp = makeOpportunity({ metrics: { ...makeOpportunity().metrics, volatilityScore: 1 } });
    const result = agent.generate(opp);
    expect(result.strategyType).toBe('narrow');
    expect(result.recommendedRangeBps).toBe(300);
    expect(result.rebalanceThreshold).toBe(1.0);
  });

  it('derives medium range for moderate volatility', () => {
    const opp = makeOpportunity({ metrics: { ...makeOpportunity().metrics, volatilityScore: 3 } });
    const result = agent.generate(opp);
    expect(result.strategyType).toBe('medium');
    expect(result.recommendedRangeBps).toBe(800);
  });

  it('derives wide range for high volatility', () => {
    const opp = makeOpportunity({ metrics: { ...makeOpportunity().metrics, volatilityScore: 6 } });
    const result = agent.generate(opp);
    expect(result.strategyType).toBe('wide');
    expect(result.recommendedRangeBps).toBe(2000);
  });

  it('derives full-range for extreme volatility', () => {
    const opp = makeOpportunity({ metrics: { ...makeOpportunity().metrics, volatilityScore: 9 } });
    const result = agent.generate(opp);
    expect(result.strategyType).toBe('full-range');
    expect(result.recommendedRangeBps).toBe(10000);
  });

  it('scales confidence by opportunity score', () => {
    const oppHigh = makeOpportunity({ score: 90 });
    const oppLow = makeOpportunity({ score: 10 });
    expect(agent.generate(oppHigh).confidence).toBeGreaterThan(agent.generate(oppLow).confidence);
  });

  it('clamps confidence between 5 and 95', () => {
    const oppMax = makeOpportunity({ score: 200 });
    const oppMin = makeOpportunity({ score: -10 });
    expect(agent.generate(oppMax).confidence).toBeLessThanOrEqual(95);
    expect(agent.generate(oppMin).confidence).toBeGreaterThanOrEqual(5);
  });

  it('scales capital by fee efficiency', () => {
    const oppExcel = makeOpportunity({ feeAnalysis: { ...makeOpportunity().feeAnalysis, efficiency: 'excellent' } });
    const oppPoor = makeOpportunity({ feeAnalysis: { ...makeOpportunity().feeAnalysis, efficiency: 'poor' } });
    const excel = agent.generate(oppExcel);
    const poor = agent.generate(oppPoor);
    expect(excel.suggestedCapitalUsd).toBeGreaterThan(poor.suggestedCapitalUsd);
  });

  it('generateWithLLM falls back on LLM error', async () => {
    const mockLLM = { complete: async () => { throw new Error('fail'); } } as any;
    const result = await agent.generateWithLLM(makeOpportunity(), mockLLM);
    expect(result.strategyType).toBeDefined();
    expect(result.llmRationale).toBeUndefined();
  });

  it('includes pool address in output', () => {
    const result = agent.generate(makeOpportunity());
    expect(result.poolAddress).toBe('0xpool1');
    expect(result.rationale).toBeTruthy();
  });
});
