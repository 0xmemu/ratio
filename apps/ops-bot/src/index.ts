/**
 * @app ops-bot
 * Ratio Telegram Ops Bot — human-in-the-loop approval gate.
 *
 * Commands:
 *   /start         — welcome + mode
 *   /help          — full command list
 *   /status        — system health + DRY_RUN flag
 *   /summary       — daily digest (positions, decisions, services)
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
import { summaryHandler } from './commands/summary';
import { createAlerter } from './commands/alert';

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

// Bound alerter — usable by any module that imports ops-bot
export const alert = createAlerter(bot, ALLOWED_IDS);

function isAllowed(userId: number): boolean {
  return ALLOWED_IDS.includes(String(userId));
}

function guard(msg: TelegramBot.Message): boolean {
  if (!isAllowed(msg.from!.id)) {
    bot.sendMessage(msg.chat.id, '⛔ Unauthorized.');
    return false;
  }
  return true;
}

// ---- /start ------------------------------------------------------------------
bot.onText(/\/start/, (msg) => {
  if (!guard(msg)) return;
  bot.sendMessage(
    msg.chat.id,
    `🤖 <b>Ratio Ops Bot online.</b>\nMode: <b>${DRY_RUN ? 'DRY_RUN' : '⚡ LIVE'}</b>\n\nType /help for all commands.`,
    { parse_mode: 'HTML' },
  );
});

// ---- /help -------------------------------------------------------------------
bot.onText(/\/help/, (msg) => {
  if (!guard(msg)) return;
  const lines = [
    '📋 <b>Ratio Ops Bot — Commands</b>',
    '',
    '/status        — system health + mode',
    '/summary       — daily digest',
    '/pending       — decisions awaiting approval',
    '/approve &lt;id&gt;  — approve a decision',
    '/deny &lt;id&gt;     — deny a decision',
    '/positions     — open positions',
    '/decisions     — last 10 decisions',
    '/help          — this message',
  ];
  bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'HTML' });
});

// ---- /status -----------------------------------------------------------------
bot.onText(/\/status/, async (msg) => {
  if (!guard(msg)) return;
  try {
    const heartbeats = await db.serviceHeartbeat.findMany({
      orderBy: { checkedAt: 'desc' },
      take: 5,
    });
    const lines = heartbeats.map(
      (h) => `${h.status === 'ok' ? '✅' : '❌'} <code>${h.service}</code>: ${h.status} — ${h.checkedAt.toISOString().slice(11, 19)} UTC`,
    );
    bot.sendMessage(
      msg.chat.id,
      [
        `🖥 <b>System Status</b>`,
        `Mode: <b>${DRY_RUN ? 'DRY_RUN' : '⚡ LIVE'}</b>`,
        '',
        ...lines,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error: ${String(err)}`);
  }
});

// ---- /summary ----------------------------------------------------------------
bot.onText(/\/summary/, summaryHandler(bot, db, ALLOWED_IDS, DRY_RUN));

// ---- /pending ----------------------------------------------------------------
bot.onText(/\/pending/, async (msg) => {
  if (!guard(msg)) return;
  try {
    const decisions = await db.rebalanceDecision.findMany({
      where: { status: 'PENDING_APPROVAL' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    if (!decisions.length) {
      bot.sendMessage(msg.chat.id, '✅ No pending decisions.');
      return;
    }
    const lines = decisions.map(
      (d) =>
        `🔸 <code>${d.id.slice(0, 8)}</code>\nPool: <code>${d.poolId.slice(0, 10)}…</code>\nAction: <b>${d.action}</b>\nReason: ${d.reason ?? '-'}\n/approve ${d.id.slice(0, 8)} | /deny ${d.id.slice(0, 8)}`,
    );
    bot.sendMessage(
      msg.chat.id,
      [`⏳ <b>Pending Decisions (${decisions.length})</b>`, '', ...lines].join('\n'),
      { parse_mode: 'HTML' },
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error: ${String(err)}`);
  }
});

// ---- /approve ----------------------------------------------------------------
bot.onText(/\/approve (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const decisionId = match![1].trim();
  try {
    const decision = await db.rebalanceDecision.findFirst({
      where: { id: { startsWith: decisionId } },
    });
    if (!decision) {
      bot.sendMessage(msg.chat.id, `❌ Decision <code>${decisionId}</code> not found.`, { parse_mode: 'HTML' });
      return;
    }
    if (decision.status !== 'PENDING_APPROVAL') {
      bot.sendMessage(msg.chat.id, `⚠️ Decision already <b>${decision.status}</b>.`, { parse_mode: 'HTML' });
      return;
    }
    await db.$transaction([
      db.rebalanceDecision.update({
        where: { id: decision.id },
        data: { status: 'APPROVED' },
      }),
      db.approval.create({
        data: { decisionId: decision.id, approvedBy: String(msg.from!.id), action: 'APPROVE' },
      }),
    ]);
    bot.sendMessage(
      msg.chat.id,
      `✅ Decision <code>${decision.id.slice(0, 8)}</code> <b>APPROVED</b>.${DRY_RUN ? '\n⚠️ DRY_RUN — no tx will execute.' : ''}`,
      { parse_mode: 'HTML' },
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error: ${String(err)}`);
  }
});

// ---- /deny -------------------------------------------------------------------
bot.onText(/\/deny (.+)/, async (msg, match) => {
  if (!guard(msg)) return;
  const decisionId = match![1].trim();
  try {
    const decision = await db.rebalanceDecision.findFirst({
      where: { id: { startsWith: decisionId } },
    });
    if (!decision) {
      bot.sendMessage(msg.chat.id, `❌ Decision <code>${decisionId}</code> not found.`, { parse_mode: 'HTML' });
      return;
    }
    if (decision.status !== 'PENDING_APPROVAL') {
      bot.sendMessage(msg.chat.id, `⚠️ Decision already <b>${decision.status}</b>.`, { parse_mode: 'HTML' });
      return;
    }
    await db.$transaction([
      db.rebalanceDecision.update({
        where: { id: decision.id },
        data: { status: 'DENIED' },
      }),
      db.approval.create({
        data: { decisionId: decision.id, approvedBy: String(msg.from!.id), action: 'DENY' },
      }),
    ]);
    bot.sendMessage(
      msg.chat.id,
      `🚫 Decision <code>${decision.id.slice(0, 8)}</code> <b>DENIED</b>.`,
      { parse_mode: 'HTML' },
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error: ${String(err)}`);
  }
});

// ---- /positions --------------------------------------------------------------
bot.onText(/\/positions/, async (msg) => {
  if (!guard(msg)) return;
  try {
    const positions = await db.position.findMany({
      where: { status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      take: 10,
    });
    if (!positions.length) {
      bot.sendMessage(msg.chat.id, '📭 No open positions.');
      return;
    }
    const lines = positions.map(
      (p) =>
        `🟢 Pool: <code>${p.poolId.slice(0, 12)}…</code>\nTokenId: <code>${p.tokenId ?? '-'}</code>\nOpened: ${p.openedAt?.toISOString().slice(0, 16) ?? '?'} UTC`,
    );
    bot.sendMessage(
      msg.chat.id,
      [`📂 <b>Open Positions (${positions.length})</b>`, '', ...lines].join('\n'),
      { parse_mode: 'HTML' },
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error: ${String(err)}`);
  }
});

// ---- /decisions --------------------------------------------------------------
bot.onText(/\/decisions/, async (msg) => {
  if (!guard(msg)) return;
  try {
    const decisions = await db.rebalanceDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    if (!decisions.length) {
      bot.sendMessage(msg.chat.id, '📭 No decisions yet.');
      return;
    }
    const statusIcon: Record<string, string> = {
      PENDING_APPROVAL: '⏳',
      APPROVED: '✅',
      DENIED: '🚫',
      EXECUTED: '⚡',
      FAILED: '❌',
    };
    const lines = decisions.map(
      (d) =>
        `${statusIcon[d.status] ?? '•'} <code>${d.id.slice(0, 8)}</code> <b>${d.action}</b> — ${d.poolId.slice(0, 10)}… [${d.status}]`,
    );
    bot.sendMessage(
      msg.chat.id,
      [`📋 <b>Last ${decisions.length} Decisions</b>`, '', ...lines].join('\n'),
      { parse_mode: 'HTML' },
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `Error: ${String(err)}`);
  }
});

// ---- Startup -----------------------------------------------------------------
console.log(`[ops-bot] Starting... DRY_RUN=${DRY_RUN}`);

// Send startup alert to all operators
void alert({
  level: 'info',
  title: 'Ops Bot Started',
  body: `Ratio ops-bot online. Mode: ${DRY_RUN ? 'DRY_RUN' : 'LIVE'}`,
  metadata: { mode: DRY_RUN ? 'DRY_RUN' : 'LIVE', time: new Date().toISOString() },
});

process.on('SIGTERM', async () => {
  console.log('[ops-bot] SIGTERM received, shutting down...');
  await bot.stopPolling();
  await disconnectDb();
  process.exit(0);
});
