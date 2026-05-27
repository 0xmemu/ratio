/**
 * hook-classifier.ts
 * Analyzes Uniswap v4 hook bytecode patterns to classify behavior and assess risk.
 * Determines trust levels: unknown → analyzed → audited → allowlisted.
 */

import type { HookProfile, HookFlags } from './index';

export type HookCategory =
  | 'fee_manipulation'
  | 'liquidity_gating'
  | 'swap_interception'
  | 'oracle'
  | 'donation'
  | 'passive'
  | 'complex'
  | 'unknown';

export interface HookClassification {
  address: string;
  category: HookCategory;
  flags: HookFlags;
  trustLevel: 'unknown' | 'audited' | 'allowlisted';
  riskScore: number;
  reasons: string[];
  hasUpgradeProxy: boolean;
  hasOwnerPause: boolean;
  isImmutable: boolean;
}

export class HookClassifier {
  private knownHooks: Map<string, HookClassification> = new Map();

  /**
   * Classify a hook by analyzing its bytecode + on-chain profile.
   * In production, this would query etherscan API or use static analysis.
   */
  classify(profile: HookProfile): HookClassification {
    const existing = this.knownHooks.get(profile.address.toLowerCase());
    if (existing) return existing;

    const reasons: string[] = [];
    let riskScore = 0.3;
    let category: HookCategory = 'unknown';

    // Phase 1: Flag analysis
    const flagCount = countFlags(profile.flags);
    if (flagCount >= 6) {
      category = 'complex';
      riskScore += 0.25;
      reasons.push('high hook surface area: 6+ flags active');
    } else if (flagCount >= 3) {
      category = 'swap_interception';
      riskScore += 0.15;
      reasons.push('moderate hook surface: 3-5 flags active');
    } else if (flagCount === 0) {
      category = 'passive';
      riskScore = 0.05;
      reasons.push('zero active hook flags — passive');
    }

    // Phase 2: Specific flag risks
    if (profile.flags.beforeSwap && profile.flags.afterSwap) {
      riskScore += 0.2;
      reasons.push('full swap interception (before + after swap)');
      if (category === 'passive' || category === 'unknown') category = 'swap_interception';
    }

    if (
      profile.flags.beforeAddLiquidity ||
      profile.flags.beforeRemoveLiquidity
    ) {
      riskScore += 0.15;
      reasons.push('liquidity operation gating');
      if (category === 'passive') category = 'liquidity_gating';
    }

    if (profile.flags.beforeDonate || profile.flags.afterDonate) {
      category = 'donation';
      riskScore += 0.05;
    }

    if (!profile.flags.beforeSwap && !profile.flags.afterSwap) {
      riskScore -= 0.1;
    }

    // Phase 3: Trust-based risk adjustment
    if (profile.trustLevel === 'allowlisted') {
      riskScore = Math.min(riskScore, 0.2);
      reasons.push('allowlisted — risk capped at 0.2');
    } else if (profile.trustLevel === 'audited') {
      riskScore = Math.min(riskScore, 0.4);
      reasons.push('audited — risk capped at 0.4');
    }

    riskScore = Math.max(0, Math.min(1, riskScore));

    const classification: HookClassification = {
      address: profile.address,
      category,
      flags: profile.flags,
      trustLevel: profile.trustLevel,
      riskScore: Math.round(riskScore * 100) / 100,
      reasons,
      hasUpgradeProxy: false,
      hasOwnerPause: false,
      isImmutable: true,
    };

    this.knownHooks.set(profile.address.toLowerCase(), classification);
    return classification;
  }

  /**
   * Pre-register a known hook with audited classification.
   */
  registerKnown(
    address: string,
    category: HookCategory,
    flags: HookFlags,
    trustLevel: 'audited' | 'allowlisted',
    metadata?: { hasUpgradeProxy?: boolean; hasOwnerPause?: boolean }
  ): void {
    const classification: HookClassification = {
      address,
      category,
      flags,
      trustLevel,
      riskScore: trustLevel === 'allowlisted' ? 0.1 : 0.3,
      reasons: [`pre-registered as ${trustLevel}`, `category: ${category}`],
      hasUpgradeProxy: metadata?.hasUpgradeProxy ?? false,
      hasOwnerPause: metadata?.hasOwnerPause ?? false,
      isImmutable: !(metadata?.hasUpgradeProxy ?? false),
    };
    this.knownHooks.set(address.toLowerCase(), classification);
  }

  /**
   * Batch classify multiple hooks.
   */
  classifyAll(profiles: HookProfile[]): HookClassification[] {
    return profiles.map((p) => this.classify(p));
  }

  /**
   * Get classification summary stats.
   */
  getSummary(profiles: HookProfile[]): {
    total: number;
    safe: number;
    caution: number;
    danger: number;
    byCategory: Record<string, number>;
  } {
    const classifications = this.classifyAll(profiles);
    const byCategory: Record<string, number> = {};

    let safe = 0;
    let caution = 0;
    let danger = 0;

    for (const c of classifications) {
      if (c.riskScore <= 0.3) safe++;
      else if (c.riskScore <= 0.6) caution++;
      else danger++;

      byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    }

    return {
      total: profiles.length,
      safe,
      caution,
      danger,
      byCategory,
    };
  }

  getKnownHooks(): HookClassification[] {
    return [...this.knownHooks.values()];
  }

  size(): number {
    return this.knownHooks.size;
  }

  clear(): void {
    this.knownHooks.clear();
  }
}

function countFlags(flags: HookFlags): number {
  return [
    flags.beforeInitialize,
    flags.afterInitialize,
    flags.beforeAddLiquidity,
    flags.afterAddLiquidity,
    flags.beforeRemoveLiquidity,
    flags.afterRemoveLiquidity,
    flags.beforeSwap,
    flags.afterSwap,
    flags.beforeDonate,
    flags.afterDonate,
  ].filter(Boolean).length;
}

export default HookClassifier;
