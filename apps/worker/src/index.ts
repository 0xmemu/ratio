/**
 * @app worker
 * Ratio background worker — cron-based job scheduler.
 * Jobs: ingest (5m) → score (15m) → decide (30m) → execute (1m, live gate)
 *
 * Execute job:
 *   - Polls for RebalanceDecisions with status='approved'
 *   - Verifies Approval record still valid (not expired)
 *   - Calls ExecutionEngine.execute()
 *   - Updates RebalanceDecision.txHash + status='executed'
 *   - Logs AuditEvent
 *
 * To run: pnpm --filter @ratio/worker start
 */

import cron from 'node-cron';
import { db, disconnectDb, heartbeat } from '@ratio/db';
import { runIngestJob } from './jobs/ingest';
import { runScoreJob } from './jobs/score';
import { runDecideJob } from './jobs/decide';
import { ExecutionEngine } from '@ratio/execution-engine';

const DRY_RUN = process.env.EXECUTION_MODE !== 'live';
const RPC_URL = process.env.ETH_RPC_URL ?? '';
const NFT_MANAGER = process.env.UNISWAP_V3_NFT_MANAGER ?? '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'; // mainnet
const ETH_PRICE_USD = parseFloat(process.env.ETH_PRICE_USD ?? '3000');

console.log(`[worker] Starting Ratio worker (dryRun=${DRY_RUN})...`);
console.log(`[worker] NODE_ENV=${process.env.NODE_ENV}`);

// ExecutionEngine singleton (shared across cron invocations)
const executionEngine = new ExecutionEngine({
  mode: DRY_RUN ? 'dry_run' : 'live',
  rpcUrl: RPC_URL,
  nftManagerAddress: NFT_MANAGER,
  maxGasUnits: 300_000,
  gasPriceCeilingGwei: 50,
  slippageBps: 50,         // 0.5%
  dailyGasBudgetUsd: 200,  // $200/day gas max
  ethPriceUsd: ETH_PRICE_USD,
});

async function runJob(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    console.log(`[worker] Running job: ${name}`);
    await fn();
    await heartbeat('worker', 'ok', { lastJob: name });
  } catch (err) {
    console.error(`[worker] Job ${name} failed:`, err);
    await heartbeat('worker', 'error', { lastJob: name, error: String(err) }).catch(() => {});
  }
}

// ---- Execute Job — runs every 60 seconds — checks approved decisions ----
async function runExecuteJob(): Promise<void> {
  // Find approved decisions not yet executed
  const approvedDecisions = await db.rebalanceDecision.findMany({
    where: { status: 'approved' },
    include: { approval: true, pool: true },
    orderBy: { createdAt: 'asc' },
    take: 5, // max 5 per cycle
  });

  if (approvedDecisions.length === 0) return;

  console.log(`[worker][execute] Found ${approvedDecisions.length} approved decision(s)`);

  for (const decision of approvedDecisions) {
    const approval = decision.approval;

    // Sanity checks
    if (!approval || approval.status !== 'approved') {
      console.warn(`[worker][execute] Decision ${decision.id} approval invalid, skipping`);
      continue;
    }
    if (new Date() > approval.expiresAt) {
      await db.rebalanceDecision.update({
        where: { id: decision.id },
        data: { status: 'rejected' },
      });
      await db.auditEvent.create({
        data: {
          eventType: 'approval_expired',
          entityType: 'decision',
          entityId: decision.id,
          decisionId: decision.id,
          actor: 'system',
          payload: { reason: 'approval_expired' },
        },
      });
      console.warn(`[worker][execute] Decision ${decision.id} approval expired, rejected`);
      continue;
    }

    // Build execution request
    const deadline = Math.floor(Date.now() / 1000) + 180; // 3 min
    const walletAddress = process.env.WALLET_ADDRESS ?? '';

    const result = await executionEngine.execute({
      poolAddress: decision.pool.address,
      action: decision.action as 'mint' | 'burn' | 'collect' | 'rebalance',
      tickLower: decision.tickLower,
      tickUpper: decision.tickUpper,
      recipient: walletAddress,
      deadline,
      policyApprovalId: approval.id,
      decisionId: decision.id,
    });

    if (result.success) {
      await db.rebalanceDecision.update({
        where: { id: decision.id },
        data: {
          status: result.dryRun ? 'dry_run' : 'executed',
          txHash: result.txHash ?? null,
          executedAt: new Date(),
        },
      });
      await db.auditEvent.create({
        data: {
          eventType: result.dryRun ? 'dry_run_executed' : 'executed',
          entityType: 'decision',
          entityId: decision.id,
          decisionId: decision.id,
          actor: 'system',
          payload: { txHash: result.txHash, dryRun: result.dryRun },
        },
      });
      console.log(`[worker][execute] Decision ${decision.id} ${result.dryRun ? 'DRY_RUN' : 'LIVE'} txHash=${result.txHash ?? 'n/a'}`);
    } else {
      await db.rebalanceDecision.update({
        where: { id: decision.id },
        data: { status: 'rejected' },
      });
      await db.auditEvent.create({
        data: {
          eventType: 'execution_error',
          entityType: 'decision',
          entityId: decision.id,
          decisionId: decision.id,
          actor: 'system',
          payload: { error: result.error },
        },
      });
      console.error(`[worker][execute] Decision ${decision.id} FAILED: ${result.error}`);
    }
  }
}

// ---- Cron Schedules ----
// Ingest: every 5 minutes
cron.schedule('*/5 * * * *', () => runJob('ingest', runIngestJob));

// Score: every 15 minutes
cron.schedule('*/15 * * * *', () => runJob('score', runScoreJob));

// Decide: every 30 minutes
cron.schedule('*/30 * * * *', () => runJob('decide', runDecideJob));

// Execute: every 60 seconds (polls for approved decisions)
cron.schedule('* * * * *', () => runJob('execute', runExecuteJob));

// Graceful shutdown
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
