import { describe, it, expect, beforeEach } from 'vitest';
import { V4DiscoveryService } from './v4-discovery';
import type { RawPoolCreatedEvent } from './v4-discovery';
import type { HookFlags } from './index';

const makeEvent = (overrides: Partial<RawPoolCreatedEvent> = {}): RawPoolCreatedEvent => ({
  poolId: '0xpool1',
  currency0: '0xETH',
  currency1: '0xUSDC',
  fee: 3000,
  tickSpacing: 60,
  hookAddress: '0xhook1',
  tvlUsd: 500_000,
  volume24h: 200_000,
  blockTimestamp: Date.now() - 86400,
  ...overrides,
});

const passiveFlags = (): HookFlags => ({
  beforeInitialize: false, afterInitialize: false,
  beforeAddLiquidity: false, afterAddLiquidity: false,
  beforeRemoveLiquidity: false, afterRemoveLiquidity: false,
  beforeSwap: false, afterSwap: false,
  beforeDonate: false, afterDonate: false,
});

describe('V4DiscoveryService', () => {
  let service: V4DiscoveryService;

  beforeEach(() => { service = new V4DiscoveryService(); });

  it('starts empty', () => {
    expect(service.size()).toBe(0);
    expect(service.getDiscoveredPools()).toHaveLength(0);
  });

  it('parses valid pool creation events', () => {
    const pools = service.parsePoolCreatedEvents([makeEvent()]);
    expect(pools).toHaveLength(1);
    expect(pools[0]!.poolId).toBe('0xpool1');
    expect(pools[0]!.isActive).toBe(true);
  });

  it('filters pools below min TVL', () => {
    const pools = service.parsePoolCreatedEvents([
      makeEvent({ poolId: '0xrich', tvlUsd: 1_000_000 }),
      makeEvent({ poolId: '0xpoor', tvlUsd: 50_000 }),
    ]);
    expect(pools).toHaveLength(1);
    expect(pools[0]!.poolId).toBe('0xrich');
  });

  it('filters excluded hooks', () => {
    const svc = new V4DiscoveryService({ minTvlUsd: 100_000, maxHookRiskScore: 0.7, feeTiers: [3000], excludeHooks: ['0xblocked'], maxAgeDays: 90 });
    const pools = svc.parsePoolCreatedEvents([
      makeEvent({ poolId: '0xgood', hookAddress: '0xgoodhook' }),
      makeEvent({ poolId: '0xbad', hookAddress: '0xBLOCKED' }),
    ]);
    expect(pools).toHaveLength(1);
    expect(pools[0]!.poolId).toBe('0xgood');
  });

  it('filters excluded fee tiers', () => {
    const svc = new V4DiscoveryService({ minTvlUsd: 100_000, maxHookRiskScore: 0.7, feeTiers: [500], excludeHooks: [], maxAgeDays: 90 });
    const pools = svc.parsePoolCreatedEvents([
      makeEvent({ fee: 500, poolId: '0xlowfee' }),
      makeEvent({ fee: 3000, poolId: '0xhighfee' }),
    ]);
    expect(pools).toHaveLength(1);
    expect(pools[0]!.poolId).toBe('0xlowfee');
  });

  it('catalogs hooks', () => {
    service.catalogHook({ address: '0xhook1', flags: passiveFlags(), trustLevel: 'audited', riskScore: 0.15 });
    const hooks = service.getCatalogedHooks();
    expect(hooks).toHaveLength(1);
    expect(hooks[0]!.trustLevel).toBe('audited');
  });

  it('resolves cataloged hooks during discovery', () => {
    service.catalogHook({ address: '0xhook1', flags: passiveFlags(), trustLevel: 'allowlisted', riskScore: 0.05 });
    const pools = service.parsePoolCreatedEvents([makeEvent({ hookAddress: '0xhook1' })]);
    expect(pools[0]!.hook.trustLevel).toBe('allowlisted');
    expect(pools[0]!.hook.riskScore).toBe(0.05);
  });

  it('returns unknown hook for uncataloged addresses', () => {
    const pools = service.parsePoolCreatedEvents([makeEvent({ hookAddress: '0xmystery' })]);
    expect(pools[0]!.hook.trustLevel).toBe('unknown');
    expect(pools[0]!.hook.riskScore).toBe(0.5);
  });

  it('discovers with full stats', () => {
    service.catalogHook({ address: '0xhook1', flags: passiveFlags(), trustLevel: 'audited', riskScore: 0.1 });
    const result = service.discover([
      makeEvent({ tvlUsd: 500_000, volume24h: 100_000 }),
      makeEvent({ poolId: '0xpool2', tvlUsd: 1_500_000, volume24h: 500_000 }),
    ]);
    expect(result.stats.totalPools).toBe(2);
    expect(result.stats.avgTvl).toBe(1_000_000);
    expect(result.stats.avgVolume24h).toBe(300_000);
    expect(result.scannedAt).toBeGreaterThan(0);
  });

  it('clear resets state', () => {
    service.parsePoolCreatedEvents([makeEvent()]);
    service.catalogHook({ address: '0xhook1', flags: passiveFlags(), trustLevel: 'audited', riskScore: 0.1 });
    service.clear();
    expect(service.size()).toBe(0);
    expect(service.getCatalogedHooks()).toHaveLength(0);
  });

  it('getDiscoveredPools filters by current TVL', () => {
    service.parsePoolCreatedEvents([
      makeEvent({ tvlUsd: 500_000 }),
      makeEvent({ poolId: '0xpoor', tvlUsd: 50_000 }),
    ]);
    expect(service.getDiscoveredPools()).toHaveLength(1);
  });
});
