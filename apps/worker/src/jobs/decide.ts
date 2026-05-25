/**
 * @job decide
 * Reads latest pool scores, runs strategy engine to produce decisions,
 * and creates RebalanceDecision + Approval records.
 * Policy gate: all non-hold decisions require Telegram approval before execution.
 * Runs every 30 minutes.
 */

import { db, audit } from '@ratio/db';
import { StrategyEngine } from '@ratio/strategy-engine';
import { PolicyEngine } from '@ratio/policy-engine';

const DRY_RUN = process.env.EXECUTION_MODE !== 'live';
const MIN_NET_PROFIT_USD = parseFloat(process.env.MIN_NET_PROFIT_USD ?? '100');
const APPROVAL_TTL_MINUTES = parseInt(process.env.APPROVAL_TTL_MINUTES ?? '60');

export async function runDecideJob(): Promise<void> {
  console.log(`[decide] Running strategy decisions (dryRun=${DRY_RUN})...`);

  const strategyEngine = new StrategyEngine({
    minNetProfitUsd: MIN_NET_PROFIT_USD,
    dryRun: DRY_RUN,
  });

  const policyEngine = new PolicyEngine({ dryRun: DRY_RUN });

  // Get active strategy version
  const strategy = await db.strategyVersion.findFirst({
    where: { isActive: true },
    orderBy: { activatedAt: 'desc' },
  });

  // Load top-scored pools with their current open position (if any)
  const scores = await db.poolScore.findMany({
    orderBy: { createdAt: 'desc' },
    distinct: ['poolId'],
    take: 20,
    include: {
      pool: {
        include: {
          positions: {
            where: { status: 'open' },
            orderBy: { entryTimestamp: 'desc' },
            take: 1,
          },
          snapshots: {
            orderBy: { timestamp: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  console.log(`[decide] Evaluating ${scores.length} scored pools`);
  let decisionsCreated = 0;
  let approvalsRequested = 0;

  for (const s of scores) {
    const pool = s.pool;
    const position = pool.positions[0] ?? null;
    const snap = pool.snapshots[0];
    if (!snap) continue;

    // Produce strategy decision
    const decision = strategyEngine.evaluate({
      poolAddress: pool.address,
      score: s.score,
      currentPositionValueUsd: position?.capitalUsd ?? 0,
      netProfitUsd7d: s.netProfitUsd7d,
      currentTickLower: position?.tickLower ?? snap.tick - 600,
      currentTickUpper: position?.tickUpper ?? snap.tick + 600,
      optimalTickLower: snap.tick - 600,
      optimalTickUpper: snap.tick + 600,
      hasPosition: !!position,
    });

    // Skip hold decisions (no action needed)
    if (decision.action === 'hold') continue;

    // Policy gate check
    const policyResult = policyEngine.evaluate({
      action: decision.action,
      capitalUsd: decision.capitalUsd,
      isDryRun: DRY_RUN,
      poolAddress: pool.address,
    });

    if (!policyResult.allowed) {
      console.log(`[decide] Policy blocked ${decision.action} for ${pool.address}: ${policyResult.reason}`);
      continue;
    }

    // Persist decision
    const dbDecision = await db.rebalanceDecision.create({
      data: {
        poolId: pool.id,
        positionId: position?.id,
        strategyVersionId: strategy?.id,
        action: decision.action,
        tickLower: decision.tickLower,
        tickUpper: decision.tickUpper,
        capitalUsd: decision.capitalUsd,
        reason: decision.reason,
        confidence: decision.confidence,
        status: DRY_RUN ? 'dry_run' : 'pending',
        isDryRun: DRY_RUN,
      },
    });

    decisionsCreated++;

    await audit('decision_created', 'decision', dbDecision.id, 'system', {
      action: decision.action,
      poolAddress: pool.address,
      dryRun: DRY_RUN,
    }, dbDecision.id);

    // Create approval request for live mode
    if (!DRY_RUN && decision.requiresApproval) {
      const expiresAt = new Date(Date.now() + APPROVAL_TTL_MINUTES * 60 * 1000);
      await db.approval.create({
        data: {
          decisionId: dbDecision.id,
          status: 'pending',
          expiresAt,
        },
      });

      await audit('approval_requested', 'approval', dbDecision.id, 'system', {
        action: decision.action,
        expiresAt: expiresAt.toISOString(),
      }, dbDecision.id);

      approvalsRequested++;
      console.log(`[decide] Approval requested for ${decision.action} on ${pool.address}`);
    }
  }

  await audit('decide_completed', 'system', 'worker', 'system', {
    decisionsCreated,
    approvalsRequested,
    dryRun: DRY_RUN,
  });

  console.log(`[decide] Done. Decisions: ${decisionsCreated}, Approvals: ${approvalsRequested}`);
}
