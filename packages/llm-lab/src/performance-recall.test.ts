import { describe, it, expect } from 'vitest';
import { PerformanceRecall } from './performance-recall';
import { VectorMemory } from './vector-memory';
import type { StrategyEmbedding } from './vector-memory';

describe('PerformanceRecall', () => {
  const recall = new PerformanceRecall();

  it('returns empty summary when no records', () => {
    const summary = recall.getSummary();
    expect(summary.totalRecords).toBe(0);
    expect(summary.winRate).toBe(0);
    expect(summary.insights).toContain('No historical data available yet');
  });

  it('tracks profitable records', () => {
    recall.record({
      id: '1', poolAddress: '0xpool1', strategyType: 'narrow',
      feeApr: 30, volatilityScore: 2, confidence: 80,
      outcome: 'profitable', actualProfitUsd: 500, timestamp: Date.now(),
    });
    recall.record({
      id: '2', poolAddress: '0xpool2', strategyType: 'medium',
      feeApr: 15, volatilityScore: 5, confidence: 60,
      outcome: 'profitable', actualProfitUsd: 200, timestamp: Date.now(),
    });
    const summary = recall.getSummary();
    expect(summary.totalRecords).toBe(2);
    expect(summary.winRate).toBe(100);
    expect(summary.avgProfitUsd).toBe(350);
  });

  it('tracks losses correctly', () => {
    const rec = new PerformanceRecall();
    rec.record({
      id: '3', poolAddress: '0xpool3', strategyType: 'wide',
      feeApr: 5, volatilityScore: 8, confidence: 30,
      outcome: 'loss', actualProfitUsd: -300, timestamp: Date.now(),
    });
    const summary = rec.getSummary();
    expect(summary.winRate).toBe(0);
    expect(summary.avgLossUsd).toBe(300);
  });

  it('identifies best strategy type', () => {
    const rec = new PerformanceRecall();
    rec.record({ id: 'a', poolAddress: '0x1', strategyType: 'narrow', feeApr: 30, volatilityScore: 2, confidence: 80, outcome: 'profitable', actualProfitUsd: 500, timestamp: Date.now() });
    rec.record({ id: 'b', poolAddress: '0x2', strategyType: 'narrow', feeApr: 25, volatilityScore: 2, confidence: 75, outcome: 'profitable', actualProfitUsd: 400, timestamp: Date.now() });
    rec.record({ id: 'c', poolAddress: '0x3', strategyType: 'wide', feeApr: 5, volatilityScore: 8, confidence: 30, outcome: 'loss', actualProfitUsd: -200, timestamp: Date.now() });
    const summary = rec.getSummary();
    expect(summary.bestStrategyType).toBe('narrow');
  });

  it('generates insights for strong win rate', () => {
    const rec = new PerformanceRecall();
    for (let i = 0; i < 10; i++) {
      rec.record({
        id: String(i), poolAddress: `0x${i}`, strategyType: 'narrow',
        feeApr: 40, volatilityScore: 1, confidence: 85,
        outcome: i < 8 ? 'profitable' : 'loss',
        actualProfitUsd: i < 8 ? 300 : -100,
        timestamp: Date.now(),
      });
    }
    const summary = rec.getSummary();
    expect(summary.insights.some((i) => i.includes('Strong win rate'))).toBe(true);
  });

  it('generates insights for low win rate', () => {
    const rec = new PerformanceRecall();
    for (let i = 0; i < 10; i++) {
      rec.record({
        id: String(i), poolAddress: `0x${i}`, strategyType: 'wide',
        feeApr: 3, volatilityScore: 9, confidence: 20,
        outcome: i < 3 ? 'profitable' : 'loss',
        actualProfitUsd: i < 3 ? 100 : -200,
        timestamp: Date.now(),
      });
    }
    const summary = rec.getSummary();
    expect(summary.insights.some((i) => i.includes('Low win rate'))).toBe(true);
  });

  describe('recallSimilar', () => {
    it('delegates to VectorMemory.query', () => {
      const memory = new VectorMemory();
      const emb: StrategyEmbedding = {
        id: '1', poolAddress: '0xpool1', strategyType: 'medium',
        vector: [0.5, 0.5, 0.5, 0.5, 0.5],
        metadata: { timestamp: Date.now(), feeApr: 10, volatilityScore: 5, confidence: 50 },
      };
      memory.store_embedding(emb);
      const results = recall.recallSimilar(memory, [0.5, 0.5, 0.5, 0.5, 0.5]);
      expect(results).toHaveLength(1);
    });
  });

  describe('getConfidenceAdjustment', () => {
    it('returns 1.0 for empty similar list', () => {
      expect(recall.getConfidenceAdjustment([])).toBe(1.0);
    });

    it('boosts confidence when all similar were profitable', () => {
      const similar = [
        { embedding: { id: '1', poolAddress: '0x1', strategyType: 'narrow', vector: [], metadata: { timestamp: 0, feeApr: 10, volatilityScore: 1, confidence: 80, outcome: 'profitable' as const } }, similarity: 0.9 },
        { embedding: { id: '2', poolAddress: '0x2', strategyType: 'narrow', vector: [], metadata: { timestamp: 0, feeApr: 10, volatilityScore: 1, confidence: 80, outcome: 'profitable' as const } }, similarity: 0.8 },
      ];
      expect(recall.getConfidenceAdjustment(similar)).toBe(1.5);
    });

    it('reduces confidence when all similar were losses', () => {
      const similar = [
        { embedding: { id: '1', poolAddress: '0x1', strategyType: 'narrow', vector: [], metadata: { timestamp: 0, feeApr: 10, volatilityScore: 1, confidence: 80, outcome: 'loss' as const } }, similarity: 0.9 },
      ];
      expect(recall.getConfidenceAdjustment(similar)).toBe(0.5);
    });
  });
});
