/**
 * @job v4-discover
 * Scans for new Uniswap v4 pools and catalogs hooks.
 * Runs every 30 minutes. DISCOVERY MODE ONLY.
 */

import { V4DiscoveryService, HookClassifier, V4Simulator, V4Allowlist } from '@ratio/protocol-v4';
import type { RawPoolCreatedEvent } from '@ratio/protocol-v4';
import { db, audit } from '@ratio/db';

const MIN_TVL_USD = parseFloat(process.env.V4_MIN_TVL_USD ?? '250000');
const MIN_VOLUME_USD = parseFloat(process.env.V4_MIN_VOLUME_USD ?? '50000');
const SIM_CAPITAL_USD = parseFloat(process.env.V4_SIM_CAPITAL_USD ?? '5000');

const discovery = new V4DiscoveryService({
  minTvlUsd: MIN_TVL_USD,
  minVolume24h: MIN_VOLUME_USD,
  allowedFeeTiers: [100, 500, 3000, 10000],
  maxAgeDays: 90,
});

const classifier = new HookClassifier();
const simulator = new V4Simulator();
const allowlist = new V4Allowlist('discovery');

export async function runV4DiscoveryJob(): Promise<void> {
  console.log('[v4-discover] Starting v4 pool discovery...');

  let poolsDiscovered = 0;
  let hooksCataloged = 0;
  let profitablePools = 0;

  try {
    // In production, replace with actual on-chain query or subgraph call
    const DummyEvents: RawPoolCreatedEvent[] = [];
    const result = discovery.discover(DummyEvents);

    poolsDiscovered = result.stats.totalPools;
    hooksCataloged = result.stats.uniqueHooks;

    // Classify newly discovered hooks
    const hookClasses = result.hooks.map((h) => classifier.classify(h));
    hooksCataloged = hookClasses.length;

    // Simulate profitable pools
    const simInput = {
      initialCapitalUsd: SIM_CAPITAL_USD,
      rangeWidthBps: 2000,
      holdingPeriodDays: 30,
      estimatedApr: 15,
      gasCostUsd: 12,
    };

    const simSummary = simulator.simulateAll(result.pools, hookClasses, simInput);
    profitablePools = simSummary.totalProfitable;

    console.log(
      `[v4-discover] Pools: ${poolsDiscovered}, Hooks: ${hooksCataloged}, ` +
      `Profitable: ${profitablePools}/${simSummary.results.length}, ` +
      `Most risky: ${simSummary.mostRiskyHook}`,
    );

    await audit('v4_discovery_completed', 'system', 'worker', 'system', {
      poolsDiscovered,
      hooksCataloged,
      profitablePools,
      avgAdjustedApr: simSummary.avgAdjustedApr,
    });
  } catch (err) {
    console.error('[v4-discover] Job failed:', err);
    await audit('v4_discovery_failed', 'system', 'worker', 'system', {
      error: String(err),
    });
  }
}
