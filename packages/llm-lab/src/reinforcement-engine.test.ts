import { describe, it, expect } from 'vitest';
import { ReinforcementEngine } from './reinforcement-engine';
import type { RLTransition } from './reinforcement-engine';

describe('ReinforcementEngine', () => {
  const engine = new ReinforcementEngine();

  const makeTransition = (overrides: Partial<RLTransition> = {}): RLTransition => ({
    state: { volatilityBucket: 'medium', feeAprBucket: 'good', strategyType: 'medium' },
    action: { adjustConfidenceBy: 0, adjustRangeBy: 0 },
    reward: 100,
    timestamp: Date.now(),
    ...overrides,
  });

  it('starts with default weights', () => {
    const w = engine.getWeights();
    expect(w.confidenceWeight).toBe(1.0);
    expect(w.rangeWeight).toBe(1.0);
    expect(w.learningRate).toBe(0.05);
  });

  it('starts with zero episodes', () => {
    expect(engine.getEpisodeCount()).toBe(0);
  });

  it('increases episode count after update', () => {
    engine.update(makeTransition());
    expect(engine.getEpisodeCount()).toBe(1);
  });

  it('positive reward increases confidence weight', () => {
    const before = engine.getWeights().confidenceWeight;
    engine.update(makeTransition({ reward: 500 }));
    expect(engine.getWeights().confidenceWeight).toBeGreaterThan(before);
  });

  it('negative reward decreases confidence weight', () => {
    const engine2 = new ReinforcementEngine();
    const before = engine2.getWeights().confidenceWeight;
    engine2.update(makeTransition({ reward: -500 }));
    expect(engine2.getWeights().confidenceWeight).toBeLessThan(before);
  });

  it('confidence weight is clamped between 0.3 and 2.0', () => {
    const eng = new ReinforcementEngine();
    for (let i = 0; i < 200; i++) {
      eng.update(makeTransition({ reward: 1000 }));
    }
    expect(eng.getWeights().confidenceWeight).toBeLessThanOrEqual(2.0);

    const eng2 = new ReinforcementEngine();
    for (let i = 0; i < 200; i++) {
      eng2.update(makeTransition({ reward: -1000 }));
    }
    expect(eng2.getWeights().confidenceWeight).toBeGreaterThanOrEqual(0.3);
  });

  it('high volatility states adjust range weight on losses', () => {
    const eng = new ReinforcementEngine();
    const before = eng.getWeights().rangeWeight;
    eng.update(makeTransition({
      reward: -300,
      state: { volatilityBucket: 'high', feeAprBucket: 'fair', strategyType: 'wide' },
    }));
    expect(eng.getWeights().rangeWeight).toBeGreaterThan(before);
  });

  it('learning rate decays over time', () => {
    const before = engine.getWeights().learningRate;
    for (let i = 0; i < 100; i++) {
      engine.update(makeTransition());
    }
    expect(engine.getWeights().learningRate).toBeLessThan(before);
  });

  it('learning rate stays above minimum', () => {
    const eng = new ReinforcementEngine();
    for (let i = 0; i < 1000; i++) {
      eng.update(makeTransition());
    }
    expect(eng.getWeights().learningRate).toBeGreaterThanOrEqual(0.005);
  });

  it('applyWeights adjusts confidence and range', () => {
    const eng = new ReinforcementEngine();
    eng.update(makeTransition({ reward: 500 }));
    const result = eng.applyWeights(80, 800);
    expect(result.confidence).toBeGreaterThan(80);
    expect(result.rangeBps).toBeGreaterThanOrEqual(800);
  });

  it('applyWeights caps confidence at 95', () => {
    const eng = new ReinforcementEngine();
    for (let i = 0; i < 100; i++) {
      eng.update(makeTransition({ reward: 1000 }));
    }
    const result = eng.applyWeights(100, 500);
    expect(result.confidence).toBeLessThanOrEqual(95);
  });

  it('getRecentPerformance returns average of last N', () => {
    const eng = new ReinforcementEngine();
    eng.update(makeTransition({ reward: 100 }));
    eng.update(makeTransition({ reward: 200 }));
    eng.update(makeTransition({ reward: 300 }));
    expect(eng.getRecentPerformance(3)).toBe(200);
  });

  it('getRecentPerformance returns 0 when empty', () => {
    const freshEngine = new ReinforcementEngine();
    expect(freshEngine.getRecentPerformance()).toBe(0);
  });
});
