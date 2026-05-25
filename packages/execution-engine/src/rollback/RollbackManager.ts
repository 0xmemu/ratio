import { ethers } from 'ethers';
import type { RollbackConfig, RollbackReason, FailureRecord, FailureNotifier } from './types';

/**
 * RollbackManager — Phase 3 Milestone 3
 *
 * Responsibilities:
 * - Detect on-chain transaction failures (reverts, drops)
 * - Track consecutive failures per position
 * - Auto-pause system when autoPauseThreshold is reached
 * - Exponential backoff retry coordination
 * - Structured failure notification
 */
export class RollbackManager {
  private config: RollbackConfig;
  private provider: ethers.Provider;
  private notifier?: FailureNotifier;
  private failureLog: Map<string, FailureRecord[]> = new Map();
  private paused = false;

  constructor(
    provider: ethers.Provider,
    config: RollbackConfig,
    notifier?: FailureNotifier,
  ) {
    this.provider = provider;
    this.config = config;
    this.notifier = notifier;
  }

  // ---------------------------------------------------------------------------
  // Failure detection
  // ---------------------------------------------------------------------------

  /**
   * Detect whether a submitted transaction failed.
   * Returns true if the tx reverted, was dropped, or is not found.
   */
  async detectFailure(txHash: string): Promise<boolean> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt) {
        // Tx not mined yet or dropped from mempool
        return true;
      }
      // status 0 = reverted, status 1 = success
      return receipt.status === 0;
    } catch {
      return true;
    }
  }

  // ---------------------------------------------------------------------------
  // Retry with exponential backoff
  // ---------------------------------------------------------------------------

  /**
   * Attempt an operation with exponential backoff.
   * Returns the result of the operation or throws after maxRetryAttempts.
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    positionId: string,
    reason: RollbackReason,
  ): Promise<T> {
    let lastError: Error = new Error('Unknown');
    for (let attempt = 0; attempt < this.config.maxRetryAttempts; attempt++) {
      if (attempt > 0) {
        const waitMs = this.config.retryBackoffMs * 2 ** (attempt - 1);
        await this.sleep(waitMs);
      }
      try {
        return await operation();
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await this.recordFailure(positionId, undefined, reason, lastError.message);
      }
    }
    throw lastError;
  }

  // ---------------------------------------------------------------------------
  // Rollback
  // ---------------------------------------------------------------------------

  /**
   * Execute rollback for a position.
   * Rollback here means: close the failing position (stop-loss),
   * record the failure, and notify.
   * The actual position closure must be injected as a callback to avoid
   * circular dependency with PositionExecutor.
   */
  async rollbackPosition(
    positionId: string,
    reason: RollbackReason,
    closeCallback?: () => Promise<void>,
  ): Promise<void> {
    await this.recordFailure(positionId, undefined, reason, `Rollback triggered: ${reason}`);

    if (this.config.autoRollbackEnabled && closeCallback) {
      try {
        await closeCallback();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.recordFailure(positionId, undefined, 'tx_failed', `Rollback close failed: ${msg}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Failure recording & auto-pause
  // ---------------------------------------------------------------------------

  async recordFailure(
    positionId: string,
    txHash: string | undefined,
    reason: RollbackReason,
    error: string,
  ): Promise<void> {
    const existing = this.failureLog.get(positionId) ?? [];
    const record: FailureRecord = {
      positionId,
      txHash,
      reason,
      error,
      timestamp: Date.now(),
      retryCount: existing.length,
    };
    existing.push(record);
    this.failureLog.set(positionId, existing);

    if (this.notifier) {
      await this.notifier.onFailure(record);
    }

    await this.checkAutoPause();
  }

  /** Trigger auto-pause if total recent failures cross the threshold */
  private async checkAutoPause(): Promise<void> {
    if (this.paused) return;

    const windowMs = 60 * 60 * 1000; // 1 hour
    const cutoff = Date.now() - windowMs;
    let recentFailures: FailureRecord[] = [];
    for (const records of this.failureLog.values()) {
      recentFailures = recentFailures.concat(
        records.filter((r) => r.timestamp > cutoff),
      );
    }

    if (recentFailures.length >= this.config.autoPauseThreshold) {
      this.paused = true;
      const reason = `Auto-paused: ${recentFailures.length} failures in the last hour`;
      if (this.notifier) {
        await this.notifier.onAutoPause(reason, recentFailures);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Notify
  // ---------------------------------------------------------------------------

  async notifyFailure(positionId: string, reason: RollbackReason): Promise<void> {
    const records = this.failureLog.get(positionId) ?? [];
    const latest = records[records.length - 1];
    if (this.notifier && latest) {
      await this.notifier.onFailure(latest);
    }
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  isPaused(): boolean {
    return this.paused;
  }

  resume(): void {
    this.paused = false;
  }

  getFailureLog(positionId: string): FailureRecord[] {
    return this.failureLog.get(positionId) ?? [];
  }

  clearFailureLog(positionId: string): void {
    this.failureLog.delete(positionId);
  }

  // ---------------------------------------------------------------------------
  // Utils
  // ---------------------------------------------------------------------------

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
