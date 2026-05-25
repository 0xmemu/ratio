/**
 * @package db
 * Prisma client singleton for use across all apps and packages.
 * Import { db } from '@ratio/db' in any service.
 */

import { PrismaClient } from '@prisma/client';

// Singleton pattern: reuse across hot-reloads in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

// Re-export Prisma types for convenience
export type {
  Pool,
  PoolSnapshot,
  PoolScore,
  StrategyVersion,
  Position,
  RebalanceDecision,
  Approval,
  RiskAssessment,
  SimulationRun,
  NarrativeReport,
  AuditEvent,
  ServiceHeartbeat,
} from '@prisma/client';

export { Prisma } from '@prisma/client';

/**
 * Graceful shutdown helper — call in process exit handlers.
 */
export async function disconnectDb(): Promise<void> {
  await db.$disconnect();
}

/**
 * Upsert a service heartbeat.
 * Call periodically from each service to indicate liveness.
 */
export async function heartbeat(
  service: 'worker' | 'api' | 'ops-bot',
  status: 'ok' | 'degraded' | 'down' = 'ok',
  meta?: Record<string, unknown>,
): Promise<void> {
  await db.serviceHeartbeat.upsert({
    where: { service },
    update: { status, lastSeenAt: new Date(), meta: meta ?? {} },
    create: { service, status, lastSeenAt: new Date(), meta: meta ?? {} },
  });
}

/**
 * Write an immutable audit event.
 */
export async function audit(
  eventType: string,
  entityType: string,
  entityId: string,
  actor: string,
  payload?: Record<string, unknown>,
  decisionId?: string,
): Promise<void> {
  await db.auditEvent.create({
    data: {
      eventType,
      entityType,
      entityId,
      actor,
      payload: payload ?? {},
      ...(decisionId ? { decisionId } : {}),
    },
  });
}
