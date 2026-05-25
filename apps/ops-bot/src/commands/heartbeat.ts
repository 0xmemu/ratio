/**
 * heartbeat.ts — periodic service heartbeat updater for ops-bot.
 *
 * Calls db.serviceHeartbeat.upsert every 60s so /status and /summary
 * always reflect a live ops-bot status.
 *
 * Usage: call startHeartbeat(db) once at bot startup.
 */

import { PrismaClient } from '@prisma/client';

const SERVICE_NAME = 'ops-bot';
const INTERVAL_MS = 60_000; // 1 minute

export function startHeartbeat(db: PrismaClient): NodeJS.Timeout {
  const tick = async () => {
    try {
      await db.serviceHeartbeat.upsert({
        where: { service: SERVICE_NAME },
        create: { service: SERVICE_NAME, status: 'ok' },
        update: { status: 'ok', checkedAt: new Date() },
      });
    } catch (err) {
      console.error('[ops-bot/heartbeat] Failed to upsert heartbeat:', err);
    }
  };

  void tick(); // immediate first tick
  return setInterval(tick, INTERVAL_MS);
}
