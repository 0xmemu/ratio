/**
 * v4-discovery.ts
 * Uniswap v4 pool discovery via subgraph + on-chain queries.
 * Catalogs pools, hooks, and fee tiers.
 * DISCOVERY MODE ONLY — no execution.
 */

import type { HookProfile, HookFlags, V4PoolKey } from './index';

// v4 pool creation event signature
const POOL_CREATED_TOPIC = '0x' + Buffer.from('Initialize(bytes32,address,address,uint24,int24,address,uint160)').toString('hex').slice(0, 8);

export interface V4PoolDiscovery {
  poolId: string;
  poolKey: V4PoolKey;
  hook: HookProfile;
  tvlUsd: number;
  volume24h: number;
  createdAt: number;
  feeTier: number;
  tickSpacing: number;
  isActive: boolean;
}

export interface DiscoveryFilter {
  minTvlUsd: number;
  maxHookRiskScore: number;
  feeTiers: number[];
  excludeHooks: string[];
  maxAgeDays: number;
}

export interface DiscoveryResult {
  pools: V4PoolDiscovery[];
  hooks: HookProfile[];
  stats: {
    totalPools: number;
    uniqueHooks: number;
    avgTvl: number;
    avgVolume24h: number;
  };
  scannedAt: number;
}

const DEFAULT_FILTER: DiscoveryFilter = {
  minTvlUsd: 100_000,
  maxHookRiskScore: 0.7,
  feeTiers: [100, 500, 3000, 10000],
  excludeHooks: [],
  maxAgeDays: 90,
};

export class V4DiscoveryService {
  private discoveredPools: Map<string, V4PoolDiscovery> = new Map();
  private catalogedHooks: Map<string, HookProfile> = new Map();

  constructor(private filter: DiscoveryFilter = DEFAULT_FILTER) {}

  /**
   * Parse pool creation events from raw log data.
   * In production, this calls the v4 subgraph or eth_getLogs.
   */
  parsePoolCreatedEvents(events: RawPoolCreatedEvent[]): V4PoolDiscovery[] {
    const pools: V4PoolDiscovery[] = [];

    for (const event of events) {
      if (!this.passesFilter(event)) continue;

      const hook = this.resolveHook(event.hookAddress);
      const pool: V4PoolDiscovery = {
        poolId: event.poolId,
        poolKey: {
          currency0: event.currency0,
          currency1: event.currency1,
          fee: event.fee,
          tickSpacing: event.tickSpacing,
          hooks: event.hookAddress,
        },
        hook,
        tvlUsd: event.tvlUsd ?? 0,
        volume24h: event.volume24h ?? 0,
        createdAt: event.blockTimestamp,
        feeTier: event.fee,
        tickSpacing: event.tickSpacing,
        isActive: (event.tvlUsd ?? 0) >= this.filter.minTvlUsd,
      };

      pools.push(pool);
      this.discoveredPools.set(pool.poolId, pool);
    }

    return pools;
  }

  /**
   * Catalog a hook: register known hooks with their profile.
   */
  catalogHook(profile: HookProfile): void {
    this.catalogedHooks.set(profile.address.toLowerCase(), profile);
  }

  /**
   * Get all discovered pools matching current filter.
   */
  getDiscoveredPools(): V4PoolDiscovery[] {
    return [...this.discoveredPools.values()].filter(
      (p) => p.tvlUsd >= this.filter.minTvlUsd
    );
  }

  /**
   * Get all unique hooks from discovered pools.
   */
  getCatalogedHooks(): HookProfile[] {
    return [...this.catalogedHooks.values()];
  }

  /**
   * Run full discovery from raw events.
   */
  discover(events: RawPoolCreatedEvent[]): DiscoveryResult {
    const pools = this.parsePoolCreatedEvents(events);
    const validPools = pools.filter((p) => p.tvlUsd >= this.filter.minTvlUsd);
    const uniqueHooks = [
      ...new Set(validPools.map((p) => p.poolKey.hooks.toLowerCase())),
    ];

    return {
      pools: validPools,
      hooks: [...this.catalogedHooks.values()],
      stats: {
        totalPools: validPools.length,
        uniqueHooks: uniqueHooks.length,
        avgTvl:
          validPools.length > 0
            ? validPools.reduce((s, p) => s + p.tvlUsd, 0) / validPools.length
            : 0,
        avgVolume24h:
          validPools.length > 0
            ? validPools.reduce((s, p) => s + p.volume24h, 0) /
              validPools.length
            : 0,
      },
      scannedAt: Date.now(),
    };
  }

  size(): number {
    return this.discoveredPools.size;
  }

  clear(): void {
    this.discoveredPools.clear();
    this.catalogedHooks.clear();
  }

  private passesFilter(event: RawPoolCreatedEvent): boolean {
    if (!this.filter.feeTiers.includes(event.fee)) return false;
    if (this.filter.excludeHooks.includes(event.hookAddress.toLowerCase()))
      return false;
    if ((event.tvlUsd ?? 0) < this.filter.minTvlUsd) return false;
    return true;
  }

  private resolveHook(address: string): HookProfile {
    const existing = this.catalogedHooks.get(address.toLowerCase());
    if (existing) return existing;
    return {
      address,
      flags: emptyFlags(),
      trustLevel: 'unknown',
      riskScore: 0.5,
    };
  }
}

export interface RawPoolCreatedEvent {
  poolId: string;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hookAddress: string;
  tvlUsd?: number;
  volume24h?: number;
  blockTimestamp: number;
}

function emptyFlags(): HookFlags {
  return {
    beforeInitialize: false,
    afterInitialize: false,
    beforeAddLiquidity: false,
    afterAddLiquidity: false,
    beforeRemoveLiquidity: false,
    afterRemoveLiquidity: false,
    beforeSwap: false,
    afterSwap: false,
    beforeDonate: false,
    afterDonate: false,
  };
}

export default V4DiscoveryService;
