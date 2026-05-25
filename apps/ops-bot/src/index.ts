/**
 * @app ops-bot
 * Ratio Telegram Ops Bot — human-in-the-loop approval gate.
 *
 * Commands:
 *   /status        — system health + DRY_RUN flag
 *   /pending       — list decisions awaiting approval
 *   /approve <id>  — approve a RebalanceDecision (live path)
 *   /deny <id>     — deny a RebalanceDecision
 *   /positions     — current open positions
 *   /decisions     — last 10 decisions
 *
 * SECURITY:
 *   - Only TELEGRAM_ALLOWED_IDS may approve/deny.
 *   - Bot cannot sign transactions; it only sets Approval records.
 *   - Executor reads Approval before sending any on-chain tx.
 *
 * To run: pnpm --filter @ratio/ops-bot start
 */

import TelegramBot from 'node-telegram-bot-api';
import { db, disconnectDb } from '@ratio/db';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_IDS = (process.env.TELEGRAM_ALLOWED_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DRY_RUN = process.env.EXECUTION_MODE !== 'live';

if (!TOKEN) {
  console.error('[ops-bot] TELEGRAM_BOT_TOKEN not set. Exiting.');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

function isAllowed(userId: number): boolean {
  return ALLOWED_IDS.includes(String(userId));
}

function guard(msg: TelegramBot.Message): boolean {
  if (!isAllowed(msg.from!.id)) {
    bot.sendMessage(msg.chat.id, 'Unauthorized.');
    return false;
  }
  return true;
}

bot.onText(/\/start/, (msg) => {
  if (!guard(msg)) return;
  bot.sendMessage(
    msg.chat.id,
    `Ratio Ops Bot online.\nMode: ${DRY_RUN ? 'DRY_RUN' : 'LIVE'}\n\n/status /pending /approve <id> /deny <id> /positions /decisions`,
  );
});

bot.onText(/\/status/, async (msg) => {
  if (!guard(msg)) return;
  try {
    const heartbeats = await db.serviceHeartbeat.findMany({
      orderBy: { checkedAt: 'desc' },
      take: 5,
    });
    const lines = heartbeats.map((h) => `${h.service}: ${h.status}`);
    bot.sendMessage(
      msg.chat.id,
      [`Mode: ${DRY_RUN ? 'DRY_RUN' : 'LIVE'}`, '', ...lines].join('\n'),
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error: ${String(err)}`);
  }
});

bot.onText(/\/pending/, async (msg) => {
  if (!guard(msg)) return;
  try {
    const decisions = await db.rebalanceDecision.findMany({
      where: { status: 'PENDING_APPROVAL' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    if (!decisions.length) {
      bot.sendMessage(msg.chat.id, 'No pending decisions.');
      return;
    }
    const lines = decisions.map(
      (d) => `ID: ${d.id}\nPool: ${d.poolId}\nAction: ${d.action}\nReason: ${d.reason ?? '-'}`,
    );
    bot.sendMessage(msg.chat.id, lines.join('\n\n'));
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error: ${String(err)}`);
  }
});

bot.onText(/\/approve (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const decisionId = match![1].trim();
  try {
    const decision = await db.rebalanceDecision.findUnique({ where: { id: decisionId } });
    if (!decision) {
      bot.sendMessage(msg.chat.id, `Decision ${decisionId} not found.`);
      return;
    }
    if (decision.status !== 'PENDING_APPROVAL') {
      bot.sendMessage(msg.chat.id, `Decision already ${decision.status}.`);
      return;
    }
    await db.$transaction([
      db.rebalanceDecision.update({
        where: { id: decisionId },
        data: { status: 'APPROVED' },
      }),
      db.approval.create({
        data: { decisionId, approvedBy: String(msg.from!.id), action: 'APPROVE' },
      }),
    ]);
    bot.sendMessage(
      msg.chat.id,
      `Decision ${decisionId} APPROVED.${DRY_RUN ? ' (DRY_RUN — no tx will execute)' : ''}`,
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error: ${String(err)}`);
  }
});

bot.onText(/\/deny (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const decisionId = match![1].trim();
  try {
    const decision = await db.rebalanceDecision.findUnique({ where: { id: decisionId } });
    if (!decision) {
      bot.sendMessage(msg.chat.id, `Decision ${decisionId} not found.`);
      return;
    }
    if (decision.status !== 'PENDING_APPROVAL') {
      bot.sendMessage(msg.chat.id, `Decision already ${decision.status}.`);
      return;
    }
    await db.$transaction([
      db.rebalanceDecision.update({
        where: { id: decisionId },
        data: { status: 'DENIED' },
      }),
      db.approval.create({
        data: { decisionId, approvedBy: String(msg.from!.id), action: 'DENY' },
      }),
    ]);
    bot.sendMessage(msg.chat.id, `Decision ${decisionId} DENIED.`);
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error: ${String(err)}`);
  }
});

bot.onText(/\/positions/, async (msg) => {
  if (!guard(msg)) return;
  try {
    const positions = await db.position.findMany({
      where: { status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      take: 10,
    });
    if (!positions.length) {
      bot.sendMessage(msg.chat.id, 'No open positions.');
      return;
    }
    const lines = positions.map(
      (p) => `Pool: ${p.poolId}\nTokenId: ${p.tokenId ?? '-'}\nOpened: ${p.openedAt.toISOString()}`,
    );
    bot.sendMessage(msg.chat.id, lines.join('\n\n'));
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error: ${String(err)}`);
  }
});

bot.onText(/\/decisions/, async (msg) => {
  if (!guard(msg)) return;
  try {
    const decisions = await db.rebalanceDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    if (!decisions.length) {
      bot.sendMessage(msg.chat.id, 'No decisions yet.');
      return;
    }
    const lines = decisions.map(
      (d) => `${d.id.slice(0, 8)} ${d.action} ${d.status} - ${d.poolId}`,
    );
    bot.sendMessage(msg.chat.id, lines.join('\n'));
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error: ${String(err)}`);
  }
});

console.log(`[ops-bot] Starting... DRY_RUN=${DRY_RUN}`);

process.on('SIGTERM', async () => {
  console.log('[ops-bot] SIGTERM received, shutting down...');
  await bot.stopPolling();
  await disconnectDb();
  process.exit(0);
});
