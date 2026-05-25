/**
 * heartbeat.ts — worker service heartbeat.
 * Upserts ServiceHeartbeat every 60s.
 */
import { PrismaClient } from '@prisma/client';

const SERVICE_NAME = 'worker';
const INTERVAL_MS = 60_000;

export function startHeartbeat(db: PrismaClient): NodeJS.Timeout {
  const tick = async () => {
    try {
      await db.serviceHeartbeat.upsert({
        where: { service: SERVICE_NAME },
        create: { service: SERVICE_NAME, status: 'ok' },
        update: { status: 'ok', checkedAt: new Date() },
      });
    } catch (err) {
      console.error('[worker/heartbeat] Failed:', err);
    }
  };
  void tick();
  return setInterval(tick, INTERVAL_MS);
}
