import { describe, it, expect } from 'vitest';
import {
  VolatilityTracker,
  FeeAnalyzer,
  PoolScanner,
  MarketAnalyzer,
} from './market-analyzer';
import type { PoolMetrics } from './market-analyzer';

const makeMetrics = (overrides: Partial<PoolMetrics> = {}): PoolMetrics => ({
  poolAddress: '0xpool1',
  token0Symbol: 'ETH',
  token1Symbol: 'USDC',
  feeTier: 500,
  volume24h: 1_000_000,
  fees24h: 500,
  liquidityUsd: 5_000_000,
  volatilityScore: 3,
  timestamp: Date.now(),
  ...overrides,
});

describe('VolatilityTracker', () => {
  const tracker = new VolatilityTracker();

  it('classifies low volatility (score <= 2)', () => {
    const result = tracker.classify(1);
    expect(result.classification).toBe('low');
    expect(result.avgPriceDeviationPct).toBe(0.15);
    expect(result.recommendation).toContain('Narrow');
  });

  it('classifies medium volatility (score 2-5)', () => {
    const result = tracker.classify(4);
    expect(result.classification).toBe('medium');
    expect(result.avgPriceDeviationPct).toBe(1.2);
  });

  it('classifies high volatility (score 5-7)', () => {
    const result = tracker.classify(6);
    expect(result.classification).toBe('high');
    expect(result.avgPriceDeviationPct).toBe(3);
  });

  it('classifies extreme volatility (score > 7)', () => {
    const result = tracker.classify(9);
    expect(result.classification).toBe('extreme');
    expect(result.avgPriceDeviationPct).toBe(7.2);
  });
});

describe('FeeAnalyzer', () => {
  const analyzer = new FeeAnalyzer();

  it('calculates fee APR correctly', () => {
    const m = makeMetrics({ fees24h: 365, liquidityUsd: 36500 });
    const result = analyzer.analyze(m);
    expect(result.feeApr).toBeCloseTo(365, 0);
  });

  it('returns zero APR for zero liquidity', () => {
    const m = makeMetrics({ liquidityUsd: 0 });
    const result = analyzer.analyze(m);
    expect(result.feeApr).toBe(0);
  });

  it('classifies efficiency: poor', () => {
    const m = makeMetrics({ fees24h: 40, liquidityUsd: 365000 });
    const result = analyzer.analyze(m);
    expect(result.efficiency).toBe('poor');
  });

  it('classifies efficiency: fair', () => {
    const m = makeMetrics({ fees24h: 100, liquidityUsd: 365000 });
    const result = analyzer.analyze(m);
    expect(result.efficiency).toBe('fair');
  });

  it('classifies efficiency: good', () => {
    const m = makeMetrics({ fees24h: 200, liquidityUsd: 300000 });
    const result = analyzer.analyze(m);
    expect(result.efficiency).toBe('good');
  });

  it('classifies efficiency: excellent', () => {
    const m = makeMetrics({ fees24h: 500, liquidityUsd: 200000 });
    const result = analyzer.analyze(m);
    expect(result.efficiency).toBe('excellent');
  });
});

describe('PoolScanner', () => {
  const scanner = new PoolScanner();
  const analyzer = new FeeAnalyzer();

  it('scores a pool with good metrics', () => {
    const m = makeMetrics();
    const fa = analyzer.analyze(m);
    const score = scanner.score(m, fa);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('penalizes high volatility', () => {
    const mLow = makeMetrics({ volatilityScore: 1 });
    const mHigh = makeMetrics({ volatilityScore: 8 });
    const faLow = analyzer.analyze(mLow);
    const faHigh = analyzer.analyze(mHigh);
    expect(scanner.score(mLow, faLow)).toBeGreaterThan(scanner.score(mHigh, faHigh));
  });
});

describe('MarketAnalyzer', () => {
  const analyzer = new MarketAnalyzer();

  it('returns a complete opportunity analysis', () => {
    const result = analyzer.analyze(makeMetrics());
    expect(result.score).toBeGreaterThan(0);
    expect(result.volatility).toBeDefined();
    expect(result.feeAnalysis).toBeDefined();
    expect(result.reason).toBeTruthy();
    expect(result.metrics).toBeDefined();
  });

  it('analyzeWithLLM falls back gracefully when LLM fails', async () => {
    const mockLLM = {
      complete: async () => { throw new Error('unreachable'); },
    } as any;
    const result = await analyzer.analyzeWithLLM(makeMetrics(), mockLLM);
    expect(result.score).toBeGreaterThan(0);
    expect(result.llmRationale).toBeUndefined();
  });
});
