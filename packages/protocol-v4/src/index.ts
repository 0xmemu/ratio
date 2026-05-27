/**
 * @ratio/protocol-v4
 * Uniswap v4 adapter - DISCOVERY MODE ONLY in v1
 * v4 introduces hooks, singleton design, and flash accounting
 * Live execution requires explicit allowlisting - never broad autonomous execution
 */

export const UNISWAP_V4_POOL_MANAGER = '0x000000000004444c5dc75cB358380D2e3dE08A90';

export type V4Mode = 'discovery' | 'simulation' | 'restricted_live';

// Default: discovery only - live must be explicitly allowlisted
export const DEFAULT_V4_MODE: V4Mode = 'discovery';

export interface HookProfile {
  address: string;
  flags: HookFlags;
  trustLevel: 'unknown' | 'audited' | 'allowlisted';
  riskScore: number;
}

export interface HookFlags {
  beforeInitialize: boolean;
  afterInitialize: boolean;
  beforeAddLiquidity: boolean;
  afterAddLiquidity: boolean;
  beforeRemoveLiquidity: boolean;
  afterRemoveLiquidity: boolean;
  beforeSwap: boolean;
  afterSwap: boolean;
  beforeDonate: boolean;
  afterDonate: boolean;
}

export interface V4PoolKey {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

export function isHookSafeForLive(hook: HookProfile): boolean {
  // Only allowlisted hooks with known behavior can be used in live mode
  return hook.trustLevel === 'allowlisted' && hook.riskScore < 0.3;
}

export function canExecuteLive(mode: V4Mode, hook: HookProfile): boolean {
  if (mode !== 'restricted_live') return false;
  return isHookSafeForLive(hook);
}

export { V4DiscoveryService } from './v4-discovery';
export type { V4PoolDiscovery, DiscoveryFilter, DiscoveryResult, RawPoolCreatedEvent } from './v4-discovery';
export { HookClassifier } from './hook-classifier';
export type { HookCategory, HookClassification } from './hook-classifier';
export { V4Simulator } from './v4-simulation';
export type { V4SimulationInput, V4SimulationResult, V4SimulationSummary } from './v4-simulation';
export { V4Allowlist } from './v4-allowlist';
export type { AllowlistEntry, AllowlistCheck } from './v4-allowlist';
