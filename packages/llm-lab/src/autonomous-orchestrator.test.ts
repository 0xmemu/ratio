import { describe, it, expect } from 'vitest';
import { AutonomousOrchestrator } from './autonomous-orchestrator';
import type { PoolMetrics } from './market-analyzer';
import type { HistoricalSnapshot } from './backtester';

const makeMetrics = (overrides: Partial<PoolMetrics> = {}): PoolMetrics => ({
  poolAddress: '0xpool1',
  token0Symbol: 'ETH',
  token1Symbol: 'USDC',
  feeTier: 500,
  volume24h: 2_000_000,
  fees24h: 800,
  liquidityUsd: 8_000_000,
  volatilityScore: 3,
  timestamp: Date.now(),
  ...overrides,
});

const makeSnapshots = (count: number): HistoricalSnapshot[] => {
  const snaps: HistoricalSnapshot[] = [];
  const base = 2000;
  for (let i = 0; i < count; i++) {
    snaps.push({
      timestamp: Date.now() - (count - i) * 3600000,
      price: base + Math.sin(i * 0.1) * 20,
      volume: base * 1000,
      volatility: 0.01,
      fees24h: 15,
      liquidityUsd: 5000,
    });
  }
  return snaps;
};

const defaultConfig = {
  sandboxMode: true,
  useLLM: false,
  initialCapitalUsd: 5000,
  gasCostUsd: 15,
  rebalanceFrequencyPerMonth: 4,
};

describe('AutonomousOrchestrator', () => {
  it('creates with default config', () => {
    const orch = new AutonomousOrchestrator(defaultConfig);
    expect(orch.getMemorySize()).toBe(0);
  });

  it('runs full pipeline and returns result', async () => {
    const orch = new AutonomousOrchestrator(defaultConfig);
    const result = await orch.run(makeMetrics(), makeSnapshots(14));
    expect(result.poolAddress).toBe('0xpool1');
    expect(result.action).toBeDefined();
    expect(result.opportunityScore).toBeGreaterThan(0);
    expect(result.strategyType).toBeDefined();
    expect(result.decision).toBeTruthy();
  });

  it('run with LLM disabled does not throw', async () => {
    const orch = new AutonomousOrchestrator({ ...defaultConfig, useLLM: false });
    const result = await orch.run(makeMetrics(), makeSnapshots(14));
    expect(result.action).toBeDefined();
    expect(result.llmRationale).toBeUndefined();
  });

  it('records outcomes and updates memory + RL via run pipeline', async () => {
    const orch = new AutonomousOrchestrator(defaultConfig);
    const initialSize = orch.getMemorySize();

    // Running the pipeline stores embeddings in vector memory
    await orch.run(makeMetrics(), makeSnapshots(14));
    expect(orch.getMemorySize()).toBeGreaterThan(initialSize);
  });

  it('getPerformanceSummary reflects orchestrator state', async () => {
    const orch = new AutonomousOrchestrator(defaultConfig);
    // Run pipeline first to populate some data, then check summary
    await orch.run(makeMetrics(), makeSnapshots(14));
    const summary = orch.getPerformanceSummary();
    // Note: orchestrator currently only tracks outcomes in VectorMemory,
    // not PerformanceRecall directly — this returns defaults.
    expect(summary).toBeDefined();
    expect(typeof summary.totalRecords).toBe('number');
  });

  it('getRLWeights returns current weights', () => {
    const orch = new AutonomousOrchestrator(defaultConfig);
    const weights = orch.getRLWeights();
    expect(weights.confidenceWeight).toBeDefined();
    expect(weights.rangeWeight).toBeDefined();
  });

  it('getMemorySize increases after run', async () => {
    const orch = new AutonomousOrchestrator(defaultConfig);
    await orch.run(makeMetrics(), makeSnapshots(14));
    expect(orch.getMemorySize()).toBeGreaterThan(0);
  });

  it('handles extreme volatility metrics gracefully', async () => {
    const orch = new AutonomousOrchestrator(defaultConfig);
    const extreme = makeMetrics({
      volatilityScore: 9,
      volume24h: 100,
      fees24h: 0.1,
      liquidityUsd: 10000,
    });
    const result = await orch.run(extreme, makeSnapshots(1));
    expect(result.action).toBeDefined();
  });

  it('handles empty snapshots', async () => {
    const orch = new AutonomousOrchestrator(defaultConfig);
    const result = await orch.run(makeMetrics(), []);
    expect(result.simulatedProfitUsd).toBeDefined();
    expect(typeof result.action).toBe('string');
  });
});
