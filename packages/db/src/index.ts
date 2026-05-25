/**
 * @package db
 * Prisma client singleton for use across all apps and packages.
 * Import { db } from '@ratio/db' in any service.
 *
 * NOTE: validateEnv() is called at module load time — this ensures
 * that missing required variables throw early (before any DB I/O).
 */
import { PrismaClient } from '@prisma/client';
import { getEnv, validateEnv } from './env';

// Validate all required env vars at startup. Throws if anything is missing.
validateEnv();

const env = getEnv();

// Singleton pattern: reuse across hot-reloads in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
  });

if (env.NODE_ENV !== 'production') {
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

// Re-export env utilities so app-level code can import from '@ratio/db'
export { getEnv, validateEnv, getPublicEnvSummary } from './env';
export type { RatioEnv } from './env';

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
