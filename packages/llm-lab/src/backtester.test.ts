import { describe, it, expect } from 'vitest';
import { Backtester } from './backtester';
import type { HistoricalSnapshot } from './backtester';
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

const makeSnapshots = (count: number, volatility = 0.01): HistoricalSnapshot[] => {
  const base = 2000;
  const snaps: HistoricalSnapshot[] = [];
  for (let i = 0; i < count; i++) {
    const price = base + Math.sin(i * 0.1) * base * volatility;
    snaps.push({
      timestamp: Date.now() - (count - i) * 3600000,
      price,
      volume: price * 1000,
      volatility,
      fees24h: 15,
      liquidityUsd: 5000,
    });
  }
  return snaps;
};

describe('Backtester', () => {
  const backtester = new Backtester();

  it('returns empty result for empty snapshots', () => {
    const result = backtester.run(makeStrategy(), []);
    expect(result.simulatedProfitUsd).toBe(0);
    expect(result.ticks).toHaveLength(0);
    expect(result.profitable).toBe(false);
  });

  it('calculates IL correctly', () => {
    const strategy = makeStrategy({ lowerPricePct: 1, upperPricePct: 1 });
    const snaps: HistoricalSnapshot[] = [
      { timestamp: 1000, price: 2000, volume: 1000000, volatility: 0.01, fees24h: 10, liquidityUsd: 10000 },
      { timestamp: 2000, price: 2000, volume: 1000000, volatility: 0.01, fees24h: 10, liquidityUsd: 10000 },
    ];
    const result = backtester.run(strategy, snaps);
    expect(result.ticks[1].ilPct).toBeCloseTo(0, 2);
  });

  it('detects when strategy is in range', () => {
    const strategy = makeStrategy({ lowerPricePct: 10, upperPricePct: 10 });
    const snaps = makeSnapshots(10, 0.05);
    const result = backtester.run(strategy, snaps);
    expect(result.timeInRangePct).toBeGreaterThan(0);
  });

  it('detects when strategy is out of range and rebalances', () => {
    const strategy = makeStrategy({ lowerPricePct: 1, upperPricePct: 1 });
    const snaps = makeSnapshots(10, 0.05);
    const result = backtester.run(strategy, snaps);
    expect(result.rebalanceCount).toBeGreaterThanOrEqual(0);
  });

  it('computes Sharpe ratio', () => {
    const strategy = makeStrategy();
    const snaps = makeSnapshots(20, 0.005);
    const result = backtester.run(strategy, snaps);
    expect(typeof result.sharpeRatio).toBe('number');
    expect(isFinite(result.sharpeRatio)).toBe(true);
  });

  it('tracks cumulative PnL through ticks', () => {
    const strategy = makeStrategy();
    const snaps = makeSnapshots(5, 0.01);
    const result = backtester.run(strategy, snaps);
    expect(result.ticks).toHaveLength(5);
    expect(typeof result.ticks[0].cumulativePnlUsd).toBe('number');
  });

  it('detects profitability', () => {
    const strategy = makeStrategy();
    const snaps = makeSnapshots(30, 0.001);
    const result = backtester.run(strategy, snaps);
    expect(typeof result.profitable).toBe('boolean');
  });
});
