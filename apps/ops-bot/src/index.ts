/**
 * ratio-ops-bot
 * Telegram interface for observability, approvals, pausing, and operations
 * Authorized chat ID is loaded from env - never hardcoded
 */
import { startBot } from './bot.js';

const authorizedChatId = process.env['TELEGRAM_AUTHORIZED_CHAT_ID'];
if (!authorizedChatId) {
  console.error('[ratio-ops-bot] TELEGRAM_AUTHORIZED_CHAT_ID is required');
  process.exit(1);
}

const botToken = process.env['TELEGRAM_BOT_TOKEN'];
if (!botToken) {
  console.error('[ratio-ops-bot] TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

console.log('[ratio-ops-bot] starting...');
console.log(`[ratio-ops-bot] DRY_RUN=${process.env['DRY_RUN'] ?? 'true'}`);

await startBot({ botToken, authorizedChatId });
