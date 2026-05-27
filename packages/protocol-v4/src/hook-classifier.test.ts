import { describe, it, expect, beforeEach } from 'vitest';
import { HookClassifier } from './hook-classifier';
import type { HookProfile, HookFlags } from './index';

const emptyFlags = (): HookFlags => ({
  beforeInitialize: false, afterInitialize: false,
  beforeAddLiquidity: false, afterAddLiquidity: false,
  beforeRemoveLiquidity: false, afterRemoveLiquidity: false,
  beforeSwap: false, afterSwap: false,
  beforeDonate: false, afterDonate: false,
});

describe('HookClassifier', () => {
  let classifier: HookClassifier;

  beforeEach(() => { classifier = new HookClassifier(); });

  it('starts empty', () => {
    expect(classifier.size()).toBe(0);
  });

  it('classifies passive hooks with near-zero risk', () => {
    const result = classifier.classify({
      address: '0xpassive',
      flags: emptyFlags(),
      trustLevel: 'unknown',
      riskScore: 0.5,
    });
    expect(result.category).toBe('passive');
    expect(result.riskScore).toBeLessThanOrEqual(0.1);
    expect(result.reasons).toContain('zero active hook flags — passive');
  });

  it('classifies complex hooks with 6+ flags', () => {
    const flags: HookFlags = {
      beforeInitialize: true, afterInitialize: true,
      beforeAddLiquidity: true, afterAddLiquidity: true,
      beforeRemoveLiquidity: true, afterRemoveLiquidity: true,
      beforeSwap: false, afterSwap: false,
      beforeDonate: false, afterDonate: false,
    };
    const result = classifier.classify({
      address: '0xcomplex', flags, trustLevel: 'unknown', riskScore: 0.5,
    });
    expect(result.category).toBe('complex');
    expect(result.riskScore).toBeGreaterThan(0.5);
  });

  it('flags full swap interception as high risk', () => {
    const flags: HookFlags = {
      ...emptyFlags(),
      beforeSwap: true,
      afterSwap: true,
    };
    const result = classifier.classify({
      address: '0xswap', flags, trustLevel: 'unknown', riskScore: 0.5,
    });
    expect(result.category).toBe('swap_interception');
    expect(result.riskScore).toBeGreaterThan(0.4);
    expect(result.reasons.some((r) => r.includes('full swap interception'))).toBe(true);
  });

  it('cap risk at 0.2 for allowlisted hooks', () => {
    const flags: HookFlags = { ...emptyFlags(), beforeSwap: true, afterSwap: true };
    classifier.registerKnown('0xtrusted', 'swap_interception', flags, 'allowlisted');
    const result = classifier.classify({
      address: '0xtrusted', flags, trustLevel: 'allowlisted', riskScore: 0.5,
    });
    expect(result.riskScore).toBeLessThanOrEqual(0.2);
  });

  it('cap risk at 0.4 for audited hooks', () => {
    const flags: HookFlags = { ...emptyFlags(), beforeSwap: true, afterSwap: true };
    classifier.registerKnown('0xaudited', 'swap_interception', flags, 'audited');
    const result = classifier.classify({
      address: '0xaudited', flags, trustLevel: 'audited', riskScore: 0.5,
    });
    expect(result.riskScore).toBeLessThanOrEqual(0.4);
  });

  it('detects liquidity gating', () => {
    const flags: HookFlags = { ...emptyFlags(), beforeAddLiquidity: true, beforeRemoveLiquidity: true };
    const result = classifier.classify({
      address: '0xgate', flags, trustLevel: 'unknown', riskScore: 0.5,
    });
    expect(result.category).not.toBe('passive');
    expect(result.reasons.some((r) => r.includes('liquidity operation gating'))).toBe(true);
  });

  it('classifyAll returns array matching input', () => {
    const hooks: HookProfile[] = [
      { address: '0xa', flags: emptyFlags(), trustLevel: 'unknown', riskScore: 0.5 },
      { address: '0xb', flags: { ...emptyFlags(), beforeSwap: true }, trustLevel: 'unknown', riskScore: 0.5 },
    ];
    const results = classifier.classifyAll(hooks);
    expect(results).toHaveLength(2);
  });

  it('getSummary returns risk buckets', () => {
    const hooks: HookProfile[] = [
      { address: '0xa', flags: emptyFlags(), trustLevel: 'unknown', riskScore: 0.5 },
      { address: '0xb', flags: { ...emptyFlags(), beforeSwap: true, afterSwap: true }, trustLevel: 'unknown', riskScore: 0.5 },
      { address: '0xc', flags: { ...emptyFlags(), beforeSwap: true, afterSwap: true, beforeAddLiquidity: true, beforeRemoveLiquidity: true, beforeInitialize: true, afterInitialize: true, beforeDonate: true }, trustLevel: 'unknown', riskScore: 0.5 },
    ];
    const summary = classifier.getSummary(hooks);
    expect(summary.total).toBe(3);
    expect(summary.safe + summary.caution + summary.danger).toBe(3);
    expect(Object.keys(summary.byCategory).length).toBeGreaterThan(0);
  });

  it('registerKnown sets metadata', () => {
    classifier.registerKnown('0xupgrade', 'swap_interception', emptyFlags(), 'audited', { hasUpgradeProxy: true, hasOwnerPause: true });
    const result = classifier.classify({
      address: '0xupgrade', flags: emptyFlags(), trustLevel: 'audited', riskScore: 0.5,
    });
    expect(result.hasUpgradeProxy).toBe(true);
    expect(result.hasOwnerPause).toBe(true);
    expect(result.isImmutable).toBe(false);
  });

  it('clear resets all known hooks', () => {
    classifier.registerKnown('0xknown', 'passive', emptyFlags(), 'allowlisted');
    expect(classifier.size()).toBe(1);
    classifier.clear();
    expect(classifier.size()).toBe(0);
  });
});
