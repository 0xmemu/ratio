import type { FailureNotifier, FailureRecord } from '../rollback/types';

/**
 * TelegramFailureNotifier — Phase 3 Milestone 4
 *
 * Implements FailureNotifier to send alerts to a Telegram chat.
 * Used by RollbackManager to notify the ops team on position failures.
 *
 * Env vars required:
 *   TELEGRAM_BOT_TOKEN      — bot token from @BotFather
 *   TELEGRAM_ALERT_CHAT_ID  — chat/group/channel ID to send to
 */
export interface TelegramConfig {
  botToken: string;
  chatId: string;
  /** Optional: prefix for all messages, e.g. '[RATIO-PROD]' */
  prefix?: string;
  /** If true, use HTML parse mode; default is MarkdownV2 */
  useHtml?: boolean;
  /** Timeout for fetch requests in ms, default 10_000 */
  timeoutMs?: number;
}

export class TelegramFailureNotifier implements FailureNotifier {
  private config: TelegramConfig;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // FailureNotifier interface
  // ---------------------------------------------------------------------------

  async onFailure(record: FailureRecord): Promise<void> {
    const prefix = this.config.prefix ?? '⚠️ RATIO';
    const time = new Date(record.timestamp).toISOString();
    const retry = record.retryCount > 0 ? ` (retry #${record.retryCount})` : '';

    const text = this.config.useHtml
      ? [
          `<b>${prefix} — Position Failure</b>`,
          `<b>Position:</b> <code>${record.positionId}</code>`,
          `<b>Reason:</b> ${record.reason}${retry}`,
          `<b>Error:</b> <code>${this.htmlEscape(record.error)}</code>`,
          record.txHash ? `<b>TxHash:</b> <code>${record.txHash}</code>` : null,
          `<b>Time:</b> ${time}`,
        ].filter(Boolean).join('\n')
      : [
          `*${prefix} — Position Failure*`,
          `*Position:* \`${record.positionId}\``,
          `*Reason:* ${record.reason}${retry}`,
          `*Error:* \`${this.mdEscape(record.error)}\``,
          record.txHash ? `*TxHash:* \`${record.txHash}\`` : null,
          `*Time:* ${time}`,
        ].filter(Boolean).join('\n');

    await this.sendMessage(text);
  }

  async onAutoPause(reason: string, failures: FailureRecord[]): Promise<void> {
    const prefix = this.config.prefix ?? '🚨 RATIO';
    const time = new Date().toISOString();
    const positions = [...new Set(failures.map(f => f.positionId))].join(', ');

    const text = this.config.useHtml
      ? [
          `<b>${prefix} — AUTO-PAUSED 🛑</b>`,
          `<b>Reason:</b> ${this.htmlEscape(reason)}`,
          `<b>Affected positions:</b> ${positions}`,
          `<b>Total failures in window:</b> ${failures.length}`,
          `<b>Time:</b> ${time}`,
          ``,
          `<i>System is paused. Resume via RollbackManager.resume() after investigation.</i>`,
        ].join('\n')
      : [
          `*${prefix} — AUTO\\-PAUSED 🛑*`,
          `*Reason:* ${this.mdEscape(reason)}`,
          `*Affected positions:* ${positions}`,
          `*Total failures in window:* ${failures.length}`,
          `*Time:* ${time}`,
          ``,
          `_System is paused\\. Resume via RollbackManager\.resume\(\) after investigation\._`,
        ].join('\n');

    await this.sendMessage(text);
  }

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------

  private async sendMessage(text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
    const parseMode = this.config.useHtml ? 'HTML' : 'MarkdownV2';
    const timeoutMs = this.config.timeoutMs ?? 10_000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text,
          parse_mode: parseMode,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        // Non-fatal: log to stderr but don't throw — notification failure
        // should never interrupt the main execution flow.
        console.error(`[TelegramNotifier] Failed to send message: ${response.status} ${body}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[TelegramNotifier] Fetch error: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------------
  // Escaping helpers
  // ---------------------------------------------------------------------------

  private mdEscape(text: string): string {
    // MarkdownV2 special chars: _ * [ ] ( ) ~ ` > # + - = | { } . !
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }

  private htmlEscape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------------------
  // Factory helpers
  // ---------------------------------------------------------------------------

  /** Create from environment variables */
  static fromEnv(prefix?: string): TelegramFailureNotifier {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;
    if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN env var is required');
    if (!chatId) throw new Error('TELEGRAM_ALERT_CHAT_ID env var is required');
    return new TelegramFailureNotifier({ botToken, chatId, prefix, useHtml: true });
  }
}
