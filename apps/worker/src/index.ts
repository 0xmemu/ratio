/**
 * @app worker
 * Ratio background worker — cron-based job scheduler.
 * Jobs: ingest (5m) → score (15m) → decide (30m)
 *
 * To run: pnpm --filter @ratio/worker start
 */

import cron from 'node-cron';
import { disconnectDb, heartbeat } from '@ratio/db';
import { runIngestJob } from './jobs/ingest';
import { runScoreJob } from './jobs/score';
import { runDecideJob } from './jobs/decide';

const DRY_RUN = process.env.EXECUTION_MODE !== 'live';

console.log(`[worker] Starting Ratio worker (dryRun=${DRY_RUN})...`);
console.log(`[worker] NODE_ENV=${process.env.NODE_ENV}`);

async function runJob(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    console.log(`[worker] Running job: ${name}`);
    await fn();
    await heartbeat('worker', 'ok', { lastJob: name });
  } catch (err) {
    console.error(`[worker] Job ${name} failed:`, err);
    await heartbeat('worker', 'degraded', { lastJob: name, error: String(err) });
  }
}

// Ingest: every 5 minutes
cron.schedule('*/5 * * * *', () => { void runJob('ingest', runIngestJob); });
// Score: every 15 minutes
cron.schedule('*/15 * * * *', () => { void runJob('score', runScoreJob); });
// Decide: every 30 minutes
cron.schedule('*/30 * * * *', () => { void runJob('decide', runDecideJob); });
// Heartbeat: every minute
cron.schedule('* * * * *', () => { void heartbeat('worker', 'ok'); });

// Initial run on startup
void (async () => {
  await runJob('ingest', runIngestJob);
  await new Promise((r) => setTimeout(r, 3000));
  await runJob('score', runScoreJob);
  await new Promise((r) => setTimeout(r, 2000));
  await runJob('decide', runDecideJob);
})();

process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received, shutting down...');
  await disconnectDb();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[worker] SIGINT received, shutting down...');
  await disconnectDb();
  process.exit(0);
});
