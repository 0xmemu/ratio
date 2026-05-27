import { describe, it, expect } from 'vitest';
import { RiskAgent } from './risk-agent';
import type { StrategyProposal } from './strategy-agent';
import type { BacktestResult } from './backtester';

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

const makeBacktest = (overrides: Partial<BacktestResult> = {}): BacktestResult => ({
  simulatedProfitUsd: 200,
  maxDrawdown: 100,
  rebalanceCount: 2,
  profitable: true,
  totalFeesEarned: 500,
  totalImpermanentLossUsd: 300,
  timeInRangePct: 80,
  sharpeRatio: 2.0,
  ticks: [],
  ...overrides,
});

describe('RiskAgent', () => {
  const agent = new RiskAgent();

  it('classifies safe for low-risk strategy', () => {
    const result = agent.assess(makeStrategy(), makeBacktest());
    expect(result.level).toBe('safe');
    expect(result.approved).toBe(true);
    expect(result.maxCapitalUsd).toBe(5000);
  });

  it('penalizes high drawdown', () => {
    const result = agent.assess(
      makeStrategy(),
      makeBacktest({ maxDrawdown: 2000 }),
    );
    expect(result.reasons.some((r) => r.includes('drawdown'))).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it('penalizes low time-in-range', () => {
    const result = agent.assess(
      makeStrategy(),
      makeBacktest({ timeInRangePct: 20 }),
    );
    expect(result.reasons.some((r) => r.includes('time-in-range'))).toBe(true);
  });

  it('penalizes excessive rebalancing', () => {
    const result = agent.assess(
      makeStrategy({ rebalanceThreshold: 1 }),
      makeBacktest({ rebalanceCount: 50, ticks: Array.from({ length: 7 }, (_, i) => ({
        timestamp: Date.now() + i * 3600000,
        price: 2000,
        inRange: true,
        feesEarned: 1,
        ilPct: 0,
        cumulativePnlUsd: i,
      })) }),
    );
    expect(result.reasons.some((r) => r.includes('rebalancing'))).toBe(true);
  });

  it('penalizes poor Sharpe ratio', () => {
    const result = agent.assess(
      makeStrategy(),
      makeBacktest({ sharpeRatio: 0 }),
    );
    expect(result.reasons.some((r) => r.includes('Sharpe'))).toBe(true);
  });

  it('penalizes unprofitable backtest', () => {
    const result = agent.assess(
      makeStrategy(),
      makeBacktest({ profitable: false }),
    );
    expect(result.reasons.some((r) => r.includes('Backtest not profitable'))).toBe(true);
  });

  it('penalizes low confidence', () => {
    const result = agent.assess(
      makeStrategy({ confidence: 20 }),
      makeBacktest(),
    );
    expect(result.reasons.some((r) => r.includes('confidence'))).toBe(true);
  });

  it('blocks critical risk strategies', () => {
    const result = agent.assess(
      makeStrategy({ confidence: 10 }),
      makeBacktest({
        profitable: false,
        sharpeRatio: -1,
        maxDrawdown: 2000,
        timeInRangePct: 5,
        rebalanceCount: 100,
      }),
    );
    expect(result.level).toBe('critical');
    expect(result.approved).toBe(false);
    expect(result.maxCapitalUsd).toBe(0);
  });

  it('scales capital by risk level', () => {
    const safe = agent.assess(makeStrategy(), makeBacktest());
    expect(safe.maxCapitalUsd).toBe(5000);

    const caution = agent.assess(makeStrategy({ confidence: 20 }), makeBacktest({ maxDrawdown: 1000 }));
    expect(caution.maxCapitalUsd).toBeLessThan(5000);
    expect(caution.maxCapitalUsd).toBeGreaterThan(0);
  });

  it('risk score is capped at 100', () => {
    const result = agent.assess(
      makeStrategy({ confidence: 0 }),
      makeBacktest({
        profitable: false,
        sharpeRatio: -10,
        maxDrawdown: 10000,
        timeInRangePct: 0,
        rebalanceCount: 1000,
      }),
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
