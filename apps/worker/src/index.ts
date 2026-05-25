/**
 * @app worker
 * Ratio background worker — strategy evaluation loop.
 *
 * Loop:
 *   1. Fetch pool snapshots from market-data
 *   2. Score pools via scoring-engine
 *   3. Run allocation-engine to pick top pools
 *   4. Pass decisions through policy-engine
 *   5. Submit to execution-engine (dry-run or live)
 *   6. Update heartbeat every cycle
 *
 * To run: pnpm --filter @ratio/worker start
 */

import { db, disconnectDb, heartbeat } from '@ratio/db';

const DRY_RUN = process.env.EXECUTION_MODE !== 'live';
const CYCLE_MS = parseInt(process.env.WORKER_CYCLE_MS ?? '60000', 10); // default 60s
const SERVICE = 'worker';

console.log(`[worker] Starting... DRY_RUN=${DRY_RUN}, cycle=${CYCLE_MS}ms`);

let running = false;

async function runCycle(): Promise<void> {
  if (running) {
    console.warn('[worker] Previous cycle still running, skipping.');
    return;
  }
  running = true;
  const start = Date.now();

  try {
    // 1. Fetch active pools
    const pools = await db.pool.findMany({ where: { isActive: true } });
    if (!pools.length) {
      console.log('[worker] No active pools. Skipping cycle.');
      await heartbeat(SERVICE, 'ok');
      return;
    }

    console.log(`[worker] Cycle start — ${pools.length} active pool(s)`);

    // 2–5: Strategy evaluation, scoring, allocation, policy, execution
    //       Each package is a separate import; stub here until packages are wired.
    //       Replace with real imports as packages are implemented:
    //
    //   import { scorePools } from '@ratio/scoring-engine';
    //   import { allocate } from '@ratio/allocation-engine';
    //   import { evaluatePolicy } from '@ratio/policy-engine';
    //   import { executeDecision } from '@ratio/execution-engine';
    //
    //   const scores = await scorePools(pools);
    //   const decisions = await allocate(scores);
    //   const approved = decisions.filter(evaluatePolicy);
    //   for (const d of approved) await executeDecision(d, { dryRun: DRY_RUN });

    const elapsed = Date.now() - start;
    console.log(`[worker] Cycle complete in ${elapsed}ms`);
    await heartbeat(SERVICE, 'ok');
  } catch (err) {
    console.error('[worker] Cycle error:', err);
    await heartbeat(SERVICE, 'error').catch(() => {});
  } finally {
    running = false;
  }
}

// Start loop
const timer = setInterval(() => void runCycle(), CYCLE_MS);
void runCycle(); // immediate first run

process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received, shutting down...');
  clearInterval(timer);
  await disconnectDb();
  process.exit(0);
});
