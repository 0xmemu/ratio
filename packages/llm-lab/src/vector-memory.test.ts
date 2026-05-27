import { describe, it, expect, beforeEach } from 'vitest';
import { VectorMemory } from './vector-memory';
import type { StrategyEmbedding } from './vector-memory';

describe('VectorMemory', () => {
  let memory: VectorMemory;

  beforeEach(() => {
    memory = new VectorMemory();
  });

  it('starts empty', () => {
    expect(memory.size()).toBe(0);
  });

  it('builds a normalized 5d vector', () => {
    const vec = memory.buildVector({
      feeApr: 50,
      volatilityScore: 5,
      confidence: 80,
      strategyType: 'medium',
      timestamp: Date.now(),
    });
    expect(vec).toHaveLength(5);
    expect(vec[0]).toBeCloseTo(0.5, 1);  // feeApr/100
    expect(vec[1]).toBeCloseTo(0.5, 1);  // volatility/10
    expect(vec[2]).toBeCloseTo(0.8, 1);  // confidence/100
    expect(vec[3]).toBe(0.5);            // medium
    expect(vec[4]).toBeCloseTo(1, 1);    // recency
  });

  it('encodes strategy types correctly', () => {
    expect(memory.buildVector({ feeApr: 10, volatilityScore: 1, confidence: 50, strategyType: 'narrow', timestamp: Date.now() })[3]).toBe(0.2);
    expect(memory.buildVector({ feeApr: 10, volatilityScore: 1, confidence: 50, strategyType: 'wide', timestamp: Date.now() })[3]).toBe(0.8);
    expect(memory.buildVector({ feeApr: 10, volatilityScore: 1, confidence: 50, strategyType: 'full-range', timestamp: Date.now() })[3]).toBe(1.0);
  });

  it('stores embeddings', () => {
    const emb: StrategyEmbedding = {
      id: '1',
      poolAddress: '0xpool1',
      strategyType: 'medium',
      vector: [0.5, 0.5, 0.8, 0.5, 1.0],
      metadata: { timestamp: Date.now(), feeApr: 50, volatilityScore: 5, confidence: 80 },
    };
    memory.store_embedding(emb);
    expect(memory.size()).toBe(1);
  });

  it('queries similar strategies', () => {
    const emb1: StrategyEmbedding = {
      id: '1', poolAddress: '0xpool1', strategyType: 'medium',
      vector: [0.5, 0.5, 0.8, 0.5, 1.0],
      metadata: { timestamp: Date.now(), feeApr: 50, volatilityScore: 5, confidence: 80 },
    };
    const emb2: StrategyEmbedding = {
      id: '2', poolAddress: '0xpool2', strategyType: 'wide',
      vector: [0.1, 0.8, 0.3, 0.8, 0.9],
      metadata: { timestamp: Date.now(), feeApr: 10, volatilityScore: 8, confidence: 30 },
    };
    memory.store_embedding(emb1);
    memory.store_embedding(emb2);

    const similar = memory.query([0.5, 0.5, 0.8, 0.5, 1.0], 2);
    expect(similar).toHaveLength(2);
    expect(similar[0].similarity).toBeGreaterThan(similar[1].similarity);
  });

  it('updates outcome', () => {
    const emb: StrategyEmbedding = {
      id: '1', poolAddress: '0xpool1', strategyType: 'medium',
      vector: [0.5, 0.5, 0.8, 0.5, 1.0],
      metadata: { timestamp: Date.now(), feeApr: 50, volatilityScore: 5, confidence: 80 },
    };
    memory.store_embedding(emb);
    const updated = memory.updateOutcome('1', 'profitable', 250);
    expect(updated).toBe(true);
  });

  it('updateOutcome returns false for unknown id', () => {
    expect(memory.updateOutcome('nonexistent', 'profitable', 100)).toBe(false);
  });

  it('evicts oldest entries when over capacity', () => {
    for (let i = 0; i < 550; i++) {
      memory.store_embedding({
        id: String(i), poolAddress: `0xpool${i}`, strategyType: 'medium',
        vector: [0.5, 0.5, 0.5, 0.5, 0.5],
        metadata: { timestamp: Date.now() + i, feeApr: 10, volatilityScore: 5, confidence: 50 },
      });
    }
    expect(memory.size()).toBeLessThanOrEqual(500);
  });

  it('clear removes all entries', () => {
    memory.store_embedding({
      id: '1', poolAddress: '0xpool1', strategyType: 'medium',
      vector: [0.5, 0.5, 0.5, 0.5, 0.5],
      metadata: { timestamp: Date.now(), feeApr: 10, volatilityScore: 5, confidence: 50 },
    });
    memory.clear();
    expect(memory.size()).toBe(0);
  });

  it('cosine similarity is 1 for identical vectors', () => {
    const emb: StrategyEmbedding = {
      id: '1', poolAddress: '0xpool1', strategyType: 'medium',
      vector: [0.3, 0.4, 0.5, 0.6, 0.7],
      metadata: { timestamp: Date.now(), feeApr: 10, volatilityScore: 5, confidence: 50 },
    };
    memory.store_embedding(emb);
    const results = memory.query([0.3, 0.4, 0.5, 0.6, 0.7], 1);
    expect(results[0].similarity).toBeCloseTo(1, 5);
  });
});
