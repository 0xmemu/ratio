/**
 * v4-allowlist.ts
 * Manages the restricted live execution allowlist for Uniswap v4.
 * Only explicitly allowlisted hooks and pools can be used in live mode.
 * Immutable append-only list — removals require explicit operator action.
 */

import type { HookClassification } from './hook-classifier';
import type { V4PoolDiscovery } from './v4-discovery';
import type { V4Mode } from './index';

export interface AllowlistEntry {
  address: string;
  type: 'hook' | 'pool';
  addedAt: number;
  addedBy: string;
  reason: string;
  expiresAt?: number;
  maxCapitalUsd: number;
  maxRangeBps: number;
}

export interface AllowlistCheck {
  allowed: boolean;
  violations: string[];
  maxCapitalUsd: number;
  maxRangeBps: number;
}

export class V4Allowlist {
  private hooks: Map<string, AllowlistEntry> = new Map();
  private pools: Map<string, AllowlistEntry> = new Map();
  private mode: V4Mode = 'restricted_live';

  constructor(mode?: V4Mode) {
    if (mode) this.mode = mode;
  }

  /**
   * Add a hook address to the allowlist.
   */
  addHook(
    address: string,
    reason: string,
    maxCapitalUsd: number = 10_000,
    maxRangeBps: number = 2000
  ): void {
    this.hooks.set(address.toLowerCase(), {
      address: address.toLowerCase(),
      type: 'hook',
      addedAt: Date.now(),
      addedBy: 'operator',
      reason,
      maxCapitalUsd,
      maxRangeBps,
    });
  }

  /**
   * Add a pool to the allowlist.
   */
  addPool(
    poolId: string,
    reason: string,
    maxCapitalUsd: number = 10_000,
    maxRangeBps: number = 2000
  ): void {
    this.pools.set(poolId.toLowerCase(), {
      address: poolId.toLowerCase(),
      type: 'pool',
      addedAt: Date.now(),
      addedBy: 'operator',
      reason,
      maxCapitalUsd,
      maxRangeBps,
    });
  }

  /**
   * Remove a hook from the allowlist.
   */
  removeHook(address: string): boolean {
    return this.hooks.delete(address.toLowerCase());
  }

  /**
   * Remove a pool from the allowlist.
   */
  removePool(poolId: string): boolean {
    return this.pools.delete(poolId.toLowerCase());
  }

  /**
   * Check if a hook is allowlisted for live execution.
   */
  checkHook(hookClass: HookClassification): AllowlistCheck {
    const violations: string[] = [];
    const entry = this.hooks.get(hookClass.address.toLowerCase());

    if (this.mode !== 'restricted_live') {
      violations.push('v4 mode is not restricted_live');
    }

    if (!entry) {
      violations.push('hook not allowlisted');
      return {
        allowed: false,
        violations,
        maxCapitalUsd: 0,
        maxRangeBps: 0,
      };
    }

    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      violations.push('allowlist entry expired');
    }

    if (hookClass.riskScore > 0.3) {
      violations.push(
        `hook risk score ${hookClass.riskScore} exceeds live threshold 0.3`
      );
    }

    if (hookClass.hasUpgradeProxy || hookClass.hasOwnerPause) {
      violations.push('hook is upgradeable or pausable');
    }

    return {
      allowed: violations.length === 0,
      violations,
      maxCapitalUsd: entry.maxCapitalUsd,
      maxRangeBps: entry.maxRangeBps,
    };
  }

  /**
   * Check if a pool is allowlisted for live execution.
   */
  checkPool(pool: V4PoolDiscovery): AllowlistCheck {
    const violations: string[] = [];
    const entry = this.pools.get(pool.poolId.toLowerCase());

    if (this.mode !== 'restricted_live') {
      violations.push('v4 mode is not restricted_live');
    }

    if (!entry) {
      violations.push('pool not allowlisted');
      return {
        allowed: false,
        violations,
        maxCapitalUsd: 0,
        maxRangeBps: 0,
      };
    }

    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      violations.push('allowlist entry expired');
    }

    return {
      allowed: violations.length === 0,
      violations,
      maxCapitalUsd: entry.maxCapitalUsd,
      maxRangeBps: entry.maxRangeBps,
    };
  }

  /**
   * Check both pool and its hook before live execution.
   */
  checkLiveExecution(
    pool: V4PoolDiscovery,
    hookClass: HookClassification
  ): AllowlistCheck {
    const poolCheck = this.checkPool(pool);
    const hookCheck = this.checkHook(hookClass);

    return {
      allowed: poolCheck.allowed && hookCheck.allowed,
      violations: [...poolCheck.violations, ...hookCheck.violations],
      maxCapitalUsd: Math.min(
        poolCheck.maxCapitalUsd,
        hookCheck.maxCapitalUsd
      ),
      maxRangeBps: Math.min(
        poolCheck.maxRangeBps,
        hookCheck.maxRangeBps
      ),
    };
  }

  getMode(): V4Mode {
    return this.mode;
  }

  setMode(mode: V4Mode): void {
    this.mode = mode;
  }

  getAllowedHooks(): AllowlistEntry[] {
    return [...this.hooks.values()];
  }

  getAllowedPools(): AllowlistEntry[] {
    return [...this.pools.values()];
  }

  size(): { hooks: number; pools: number } {
    return { hooks: this.hooks.size, pools: this.pools.size };
  }

  clear(): void {
    this.hooks.clear();
    this.pools.clear();
  }
}

export default V4Allowlist;
