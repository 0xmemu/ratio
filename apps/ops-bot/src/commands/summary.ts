/**
 * summary.ts — /summary command handler.
 *
 * Generates a daily digest:
 *   - Open positions count + pools
 *   - Decisions today: approved / denied / executed / failed
 *   - Active pools
 *   - Services health
 *   - Gas mode (dry-run / live)
 *
 * Register with: bot.onText(/\/summary/, summaryHandler(bot, db))
 */

import TelegramBot from 'node-telegram-bot-api';
import { PrismaClient } from '@prisma/client';

export function summaryHandler(
  bot: TelegramBot,
  db: PrismaClient,
  allowedIds: string[],
  dryRun: boolean,
) {
  return async (msg: TelegramBot.Message) => {
    if (!allowedIds.includes(String(msg.from!.id))) {
      bot.sendMessage(msg.chat.id, 'Unauthorized.');
      return;
    }

    try {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setUTCHours(0, 0, 0, 0);

      const [openPositions, pools, decisions, heartbeats] = await Promise.all([
        db.position.findMany({ where: { status: 'OPEN' }, include: { pool: true } }),
        db.pool.count({ where: { isActive: true } }),
        db.rebalanceDecision.groupBy({
          by: ['status'],
          where: { createdAt: { gte: startOfDay } },
          _count: { status: true },
        }),
        db.serviceHeartbeat.findMany({ orderBy: { checkedAt: 'desc' }, take: 5 }),
      ]);

      const decisionMap: Record<string, number> = {};
      for (const d of decisions) {
        decisionMap[d.status] = d._count.status;
      }

      const positionLines = openPositions.slice(0, 5).map(
        (p) => `  • ${p.pool?.address?.slice(0, 10) ?? p.poolId}… (opened ${p.openedAt?.toISOString().slice(0, 10) ?? '?'})`,
      );

      const serviceLines = heartbeats.map(
        (h) => `  • ${h.service}: ${h.status === 'ok' ? '✅' : '❌'} ${h.checkedAt.toISOString().slice(11, 19)} UTC`,
      );

      const lines = [
        `📊 <b>Ratio Daily Summary</b>`,
        `Mode: <b>${dryRun ? 'DRY_RUN' : 'LIVE'}</b>`,
        `Time: ${now.toISOString().slice(0, 19)} UTC`,
        '',
        `<b>Positions</b>: ${openPositions.length} open`,
        ...positionLines,
        '',
        `<b>Active Pools</b>: ${pools}`,
        '',
        `<b>Decisions today</b>:`,
        `  Approved: ${decisionMap['APPROVED'] ?? 0}`,
        `  Denied: ${decisionMap['DENIED'] ?? 0}`,
        `  Executed: ${decisionMap['EXECUTED'] ?? 0}`,
        `  Failed: ${decisionMap['FAILED'] ?? 0}`,
        `  Pending: ${decisionMap['PENDING_APPROVAL'] ?? 0}`,
        '',
        `<b>Services</b>:`,
        ...serviceLines,
      ];

      bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'HTML' });
    } catch (err) {
      bot.sendMessage(msg.chat.id, `Error generating summary: ${String(err)}`);
    }
  };
}
