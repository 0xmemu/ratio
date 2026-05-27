import { describe, it, expect, beforeEach } from 'vitest';
import { V4Allowlist } from './v4-allowlist';
import type { HookClassification } from './hook-classifier';
import type { V4PoolDiscovery } from './v4-discovery';
import type { HookFlags } from './index';

const emptyFlags = (): HookFlags => ({
  beforeInitialize: false, afterInitialize: false,
  beforeAddLiquidity: false, afterAddLiquidity: false,
  beforeRemoveLiquidity: false, afterRemoveLiquidity: false,
  beforeSwap: false, afterSwap: false,
  beforeDonate: false, afterDonate: false,
});

const makeHookClass = (overrides: Partial<HookClassification> = {}): HookClassification => ({
  address: '0xhook1',
  category: 'passive',
  flags: emptyFlags(),
  trustLevel: 'audited',
  riskScore: 0.1,
  reasons: [],
  hasUpgradeProxy: false,
  hasOwnerPause: false,
  isImmutable: true,
  ...overrides,
});

const makePool = (overrides: Partial<V4PoolDiscovery> = {}): V4PoolDiscovery => ({
  poolId: '0xpool1',
  poolKey: { currency0: 'ETH', currency1: 'USDC', fee: 3000, tickSpacing: 60, hooks: '0xhook1' },
  hook: { address: '0xhook1', flags: emptyFlags(), trustLevel: 'unknown', riskScore: 0.5 },
  tvlUsd: 1_000_000,
  volume24h: 500_000,
  createdAt: Date.now(),
  feeTier: 3000,
  tickSpacing: 60,
  isActive: true,
  ...overrides,
});

describe('V4Allowlist', () => {
  let allowlist: V4Allowlist;

  beforeEach(() => { allowlist = new V4Allowlist('restricted_live'); });

  it('defaults to restricted_live mode', () => {
    expect(allowlist.getMode()).toBe('restricted_live');
  });

  it('blocks unlisted hooks', () => {
    const check = allowlist.checkHook(makeHookClass());
    expect(check.allowed).toBe(false);
    expect(check.violations).toContain('hook not allowlisted');
  });

  it('allows listed hooks with valid risk', () => {
    allowlist.addHook('0xhook1', 'trusted auditor', 10_000, 2000);
    const check = allowlist.checkHook(makeHookClass({ riskScore: 0.1 }));
    expect(check.allowed).toBe(true);
    expect(check.maxCapitalUsd).toBe(10_000);
  });

  it('blocks allowlisted hook with high risk', () => {
    allowlist.addHook('0xhook1', 'trusted', 10_000, 2000);
    const check = allowlist.checkHook(makeHookClass({ riskScore: 0.5 }));
    expect(check.allowed).toBe(false);
    expect(check.violations.some((v) => v.includes('risk score'))).toBe(true);
  });

  it('blocks upgradeable hooks', () => {
    allowlist.addHook('0xhook1', 'trusted', 10_000, 2000);
    const check = allowlist.checkHook(makeHookClass({ hasUpgradeProxy: true }));
    expect(check.allowed).toBe(false);
  });

  it('blocks pausable hooks', () => {
    allowlist.addHook('0xhook1', 'trusted', 10_000, 2000);
    const check = allowlist.checkHook(makeHookClass({ hasOwnerPause: true }));
    expect(check.allowed).toBe(false);
  });

  it('blocks when mode is not restricted_live', () => {
    const discoveryList = new V4Allowlist('discovery');
    discoveryList.addHook('0xhook1', 'test', 10_000, 2000);
    const check = discoveryList.checkHook(makeHookClass());
    expect(check.allowed).toBe(false);
    expect(check.violations).toContain('v4 mode is not restricted_live');
  });

  it('adds and removes hooks', () => {
    allowlist.addHook('0xhook1', 'test', 10_000);
    expect(allowlist.size().hooks).toBe(1);
    allowlist.removeHook('0xhook1');
    expect(allowlist.size().hooks).toBe(0);
  });

  it('adds and removes pools', () => {
    allowlist.addPool('0xpool1', 'verified');
    expect(allowlist.size().pools).toBe(1);
    expect(allowlist.checkPool(makePool()).allowed).toBe(true);
    allowlist.removePool('0xpool1');
    expect(allowlist.size().pools).toBe(0);
  });

  it('checkLiveExecution requires both pool and hook', () => {
    allowlist.addPool('0xpool1', 'trusted pool', 5000);
    allowlist.addHook('0xhook1', 'trusted hook', 5000);
    const check = allowlist.checkLiveExecution(makePool(), makeHookClass({ riskScore: 0.1 }));
    expect(check.allowed).toBe(true);
    expect(check.maxCapitalUsd).toBe(5000);
  });

  it('checkLiveExecution fails if pool not listed', () => {
    allowlist.addHook('0xhook1', 'trusted', 5000);
    const check = allowlist.checkLiveExecution(makePool(), makeHookClass({ riskScore: 0.1 }));
    expect(check.allowed).toBe(false);
  });

  it('clear resets all entries', () => {
    allowlist.addHook('0xhook1', 'test');
    allowlist.addPool('0xpool1', 'test');
    allowlist.clear();
    expect(allowlist.size().hooks).toBe(0);
    expect(allowlist.size().pools).toBe(0);
  });

  it('getAllowedHooks returns entries', () => {
    allowlist.addHook('0xhook1', 'reason', 5000, 1000);
    allowlist.addHook('0xhook2', 'reason2', 3000, 1500);
    const entries = allowlist.getAllowedHooks();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.type).toBe('hook');
  });

  it('setMode changes execution mode', () => {
    allowlist.setMode('simulation');
    expect(allowlist.getMode()).toBe('simulation');
  });
});
