import { describe, it, expect } from 'vitest';
import { DecisionEngine } from './decision-engine';
import type { PoolOpportunity } from './market-analyzer';
import type { StrategyProposal } from './strategy-agent';
import type { BacktestResult } from './backtester';
import type { RiskAssessment } from './risk-agent';

const makeOpportunity = (overrides: Partial<PoolOpportunity> = {}): PoolOpportunity => ({
  score: 70,
  reason: 'test',
  volatility: { score: 3, classification: 'medium', avgPriceDeviationPct: 0.9, recommendation: 'test' },
  feeAnalysis: { feeApr: 25, feeDensity: 0.5, efficiency: 'good' },
  metrics: {
    poolAddress: '0xpool1', token0Symbol: 'ETH', token1Symbol: 'USDC',
    feeTier: 500, volume24h: 1_000_000, fees24h: 500,
    liquidityUsd: 5_000_000, volatilityScore: 3, timestamp: Date.now(),
  },
  ...overrides,
});

const makeStrategy = (overrides: Partial<StrategyProposal> = {}): StrategyProposal => ({
  poolAddress: '0xpool1', token0Symbol: 'ETH', token1Symbol: 'USDC',
  recommendedRangeBps: 800, lowerPricePct: 4, upperPricePct: 4,
  rebalanceThreshold: 2.5, suggestedCapitalUsd: 5000,
  confidence: 75, rationale: 'test', strategyType: 'medium',
  ...overrides,
});

const makeBacktest = (overrides: Partial<BacktestResult> = {}): BacktestResult => ({
  simulatedProfitUsd: 200, maxDrawdown: 100, rebalanceCount: 2,
  profitable: true, totalFeesEarned: 500, totalImpermanentLossUsd: 300,
  timeInRangePct: 80, sharpeRatio: 2.0, ticks: [],
  ...overrides,
});

const makeRisk = (overrides: Partial<RiskAssessment> = {}): RiskAssessment => ({
  level: 'safe', score: 10, reasons: [], approved: true, maxCapitalUsd: 5000,
  ...overrides,
});

describe('DecisionEngine', () => {
  const engine = new DecisionEngine();

  it('returns enter for strong signal', () => {
    const result = engine.decide(
      makeOpportunity({ score: 85 }),
      makeStrategy({ confidence: 90 }),
      makeBacktest(),
      makeRisk(),
    );
    expect(result.action).toBe('enter');
    expect(result.finalScore).toBeGreaterThan(40);
  });

  it('returns skip for weak opportunities', () => {
    const result = engine.decide(
      makeOpportunity({ score: 30 }),
      makeStrategy({ confidence: 35 }),
      makeBacktest({ profitable: true, sharpeRatio: 0 }),
      makeRisk({ approved: true, level: 'caution' }),
    );
    expect(result.action).toBe('skip');
  });

  it('returns exit for very weak signal', () => {
    const result = engine.decide(
      makeOpportunity({ score: 5 }),
      makeStrategy({ confidence: 5 }),
      makeBacktest({ profitable: false, sharpeRatio: -5 }),
      makeRisk({ approved: false, level: 'critical' }),
    );
    expect(result.action).toBe('exit');
  });

  it('overrides enter to skip when risk is critical', () => {
    const result = engine.decide(
      makeOpportunity({ score: 95 }),
      makeStrategy({ confidence: 95 }),
      makeBacktest({ profitable: true, sharpeRatio: 5 }),
      makeRisk({ approved: false, level: 'critical' }),
    );
    expect(result.action).toBe('skip');
  });

  it('includes all signal sources', () => {
    const result = engine.decide(makeOpportunity(), makeStrategy(), makeBacktest(), makeRisk());
    const sources = result.signals.map((s) => s.source);
    expect(sources).toContain('opportunity_score');
    expect(sources).toContain('strategy_confidence');
    expect(sources).toContain('backtest_profitable');
    expect(sources).toContain('risk_approval');
    expect(sources).toContain('sharpe_ratio');
  });

  it('produces a human-readable summary', () => {
    const result = engine.decide(makeOpportunity(), makeStrategy(), makeBacktest(), makeRisk());
    expect(result.summary).toBeTruthy();
    expect(result.summary).toContain('Action:');
  });

  it('decideWithLLM falls back on LLM error', async () => {
    const mockLLM = { complete: async () => { throw new Error('fail'); } } as any;
    const result = await engine.decideWithLLM(
      makeOpportunity(), makeStrategy(), makeBacktest(), makeRisk(), mockLLM,
    );
    expect(result.action).toBeDefined();
    expect(result.llmReasoning).toBeUndefined();
  });

  it('finalScore is between -100 and 100', () => {
    const result = engine.decide(makeOpportunity(), makeStrategy(), makeBacktest(), makeRisk());
    expect(result.finalScore).toBeGreaterThanOrEqual(-100);
    expect(result.finalScore).toBeLessThanOrEqual(100);
  });
});
