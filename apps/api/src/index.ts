/**
 * @app api
 * Ratio REST API — monitoring and control plane.
 * Endpoints: /health, /pools, /scores, /positions, /decisions, /approvals
 *
 * To run: pnpm --filter @ratio/api start
 */

import Fastify from 'fastify';
import { db, disconnectDb, heartbeat } from '@ratio/db';

const PORT = parseInt(process.env.APP_PORT ?? '3000', 10);
const HOST = process.env.APP_HOST ?? '0.0.0.0';
const DRY_RUN = process.env.EXECUTION_MODE !== 'live';

const app = Fastify({ logger: process.env.NODE_ENV !== 'production' });

// ---- Health ------------------------------------------------------------------
app.get('/health', async () => ({
  status: 'ok',
  dryRun: DRY_RUN,
  timestamp: new Date().toISOString(),
}));

app.get('/health/services', async () => {
  const heartbeats = await db.serviceHeartbeat.findMany();
  return { services: heartbeats };
});

// ---- Pools -------------------------------------------------------------------
app.get('/pools', async (req) => {
  const { active } = req.query as { active?: string };
  const pools = await db.pool.findMany({
    where: active !== undefined ? { isActive: active === 'true' } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return { pools };
});

app.get('/pools/:address', async (req) => {
  const { address } = req.params as { address: string };
  const pool = await db.pool.findUnique({
    where: { address },
    include: {
      snapshots: { orderBy: { timestamp: 'desc' }, take: 10 },
      scores: { orderBy: { createdAt: 'desc' }, take: 5 },
      positions: { where: { status: 'open' } },
    },
  });
  if (!pool) return app.httpErrors?.notFound('Pool not found');
  return { pool };
});

// ---- Scores ------------------------------------------------------------------
app.get('/scores', async () => {
  const scores = await db.poolScore.findMany({
    orderBy: [{ createdAt: 'desc' }, { rank: 'asc' }],
    distinct: ['poolId'],
    take: 20,
    include: { pool: true },
  });
  return { scores };
});

// ---- Positions ---------------------------------------------------------------
app.get('/positions', async (req) => {
  const { status } = req.query as { status?: string };
  const positions = await db.position.findMany({
    where: status ? { status } : undefined,
    orderBy: { entryTimestamp: 'desc' },
    take: 50,
    include: { pool: true },
  });
  return { positions };
});

// ---- Decisions ---------------------------------------------------------------
app.get('/decisions', async (req) => {
  const { status, dryRun } = req.query as { status?: string; dryRun?: string };
  const decisions = await db.rebalanceDecision.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(dryRun !== undefined ? { isDryRun: dryRun === 'true' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { pool: true, approval: true },
  });
  return { decisions };
});

// ---- Approvals ---------------------------------------------------------------
app.get('/approvals', async (req) => {
  const { status } = req.query as { status?: string };
  const approvals = await db.approval.findMany({
    where: status ? { status } : undefined,
    orderBy: { requestedAt: 'desc' },
    take: 50,
    include: { decision: { include: { pool: true } } },
  });
  return { approvals };
});

// ---- Audit log ---------------------------------------------------------------
app.get('/audit', async (req) => {
  const { entityType, limit } = req.query as { entityType?: string; limit?: string };
  const events = await db.auditEvent.findMany({
    where: entityType ? { entityType } : undefined,
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit ?? '100', 10),
  });
  return { events };
});

// ---- Startup -----------------------------------------------------------------
const start = async () => {
  try {
    await app.listen({ port: PORT, host: HOST });
    await heartbeat('api', 'ok');
    console.log(`[api] Listening on ${HOST}:${PORT} (dryRun=${DRY_RUN})`);
  } catch (err) {
    console.error('[api] Failed to start:', err);
    process.exit(1);
  }
};

void start();

process.on('SIGTERM', async () => {
  console.log('[api] SIGTERM received, shutting down...');
  await disconnectDb();
  await app.close();
  process.exit(0);
});
