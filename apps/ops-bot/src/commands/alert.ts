/**
 * alert.ts — push-alert helpers for ops-bot.
 *
 * Called by the worker/execution-engine when:
 *   - a position drifts out of range
 *   - gas price spikes above threshold
 *   - a daily PnL target is hit or breached
 *   - auto-pause is triggered
 *
 * Import and call `sendAlert()` from any package that has
 * TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_IDS in its env.
 */

import TelegramBot from 'node-telegram-bot-api';

export type AlertLevel = 'info' | 'warning' | 'critical';

export interface Alert {
  level: AlertLevel;
  title: string;
  body: string;
  metadata?: Record<string, string | number | boolean>;
}

const ICONS: Record<AlertLevel, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨',
};

function formatAlert(alert: Alert): string {
  const icon = ICONS[alert.level];
  const lines = [
    `${icon} <b>${escapeHtml(alert.title)}</b>`,
    escapeHtml(alert.body),
  ];
  if (alert.metadata && Object.keys(alert.metadata).length > 0) {
    lines.push('');
    for (const [k, v] of Object.entries(alert.metadata)) {
      lines.push(`<code>${escapeHtml(k)}</code>: ${escapeHtml(String(v))}`);
    }
  }
  lines.push('');
  lines.push(`<i>${new Date().toISOString()}</i>`);
  return lines.join('\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Send an alert to all allowed Telegram chat IDs.
 * Non-fatal: errors are logged but never thrown.
 */
export async function sendAlert(
  bot: TelegramBot,
  chatIds: string[],
  alert: Alert,
): Promise<void> {
  const text = formatAlert(alert);
  for (const chatId of chatIds) {
    try {
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } catch (err) {
      console.error(`[ops-bot/alert] Failed to send to ${chatId}:`, err);
    }
  }
}

/**
 * Factory: create a bound sendAlert that always uses the same bot + chatIds.
 * Usage:
 *   const alert = createAlerter(bot, allowedIds);
 *   await alert({ level: 'critical', title: 'Auto-pause', body: '...' });
 */
export function createAlerter(
  bot: TelegramBot,
  chatIds: string[],
): (alert: Alert) => Promise<void> {
  return (alert) => sendAlert(bot, chatIds, alert);
}
