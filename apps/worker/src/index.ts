/**
 * ratio-worker
 * Scheduled and queued job runner
 * Responsibilities: rescore pools, sync positions, evaluate promotion conditions
 */
import { startWorker } from './worker.js';

console.log('[ratio-worker] starting...');
console.log(`[ratio-worker] DRY_RUN=${process.env['DRY_RUN'] ?? 'true'}`);

await startWorker();
