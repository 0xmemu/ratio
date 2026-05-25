/**
 * @route GET /metrics
 * Prometheus-compatible metrics scrape endpoint.
 * Exposes system health + execution engine metrics in text/plain format.
 *
 * Usage: add this URL to prometheus.yml scrape_configs.
 */

import { FastifyInstance } from 'fastify';
import { db } from '@ratio/db';

/** Simple in-memory gauge/counter store — replace with prom-client if needed. */
const registry: Record<string, { help: string; type: string; value: () => Promise<number> }> = {};

function registerGauge(
  name: string,
  help: string,
  value: () => Promise<number>,
): void {
  registry[name] = { help, type: 'gauge', value };
}

function registerCounter(
  name: string,
  help: string,
  value: () => Promise<number>,
): void {
  registry[name] = { help, type: 'counter', value };
}

// --- Register metrics --------------------------------------------------------

registerGauge(
  'ratio_open_positions_total',
  'Number of currently open positions',
  () => db.position.count({ where: { status: 'OPEN' } }),
);

registerGauge(
  'ratio_pending_decisions_total',
  'Number of decisions awaiting approval',
  () => db.rebalanceDecision.count({ where: { status: 'PENDING_APPROVAL' } }),
);

registerCounter(
  'ratio_decisions_approved_total',
  'Cumulative approved decisions',
  () => db.rebalanceDecision.count({ where: { status: 'APPROVED' } }),
);

registerCounter(
  'ratio_decisions_denied_total',
  'Cumulative denied decisions',
  () => db.rebalanceDecision.count({ where: { status: 'DENIED' } }),
);

registerCounter(
  'ratio_decisions_executed_total',
  'Cumulative executed decisions',
  () => db.rebalanceDecision.count({ where: { status: 'EXECUTED' } }),
);

registerCounter(
  'ratio_decisions_failed_total',
  'Cumulative failed decisions',
  () => db.rebalanceDecision.count({ where: { status: 'FAILED' } }),
);

registerGauge(
  'ratio_active_pools_total',
  'Number of monitored active pools',
  () => db.pool.count({ where: { isActive: true } }),
);

registerGauge(
  'ratio_services_healthy_total',
  'Number of services with OK heartbeat in last 5 minutes',
  async () => {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    return db.serviceHeartbeat.count({
      where: { status: 'ok', checkedAt: { gte: cutoff } },
    });
  },
);

registerGauge(
  'ratio_dry_run_mode',
  '1 if EXECUTION_MODE is not live, 0 if live',
  async () => (process.env.EXECUTION_MODE !== 'live' ? 1 : 0),
);

// --- Render ------------------------------------------------------------------

async function renderMetrics(): Promise<string> {
  const lines: string[] = [];
  for (const [name, meta] of Object.entries(registry)) {
    const val = await meta.value();
    lines.push(`# HELP ${name} ${meta.help}`);
    lines.push(`# TYPE ${name} ${meta.type}`);
    lines.push(`${name} ${val}`);
  }
  return lines.join('\n') + '\n';
}

// --- Fastify plugin ----------------------------------------------------------

export async function metricsRoute(app: FastifyInstance): Promise<void> {
  app.get('/metrics', async (_req, reply) => {
    const body = await renderMetrics();
    reply
      .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(body);
  });
}
