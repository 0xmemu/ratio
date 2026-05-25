/**
 * MetricsCollector — Phase 3 Milestone 4
 *
 * Lightweight in-memory metrics collector.
 * Tracks gas spend, transaction counts, failure rates.
 * Exposes Prometheus-style text format via serialize().
 */

export interface MetricSnapshot {
  /** Total gas spent in wei across all transactions today */
  dailyGasSpentWei: bigint;
  /** Total USD equivalent gas spent today */
  dailyGasSpentUSD: number;
  /** Number of transactions executed today */
  dailyTxCount: number;
  /** Number of failures recorded today */
  dailyFailureCount: number;
  /** Failure rate 0–1 */
  failureRate: number;
  /** Timestamp of last reset */
  lastResetAt: number;
  /** Timestamp of last update */
  lastUpdatedAt: number;
}

export interface TxRecord {
  txHash: string;
  gasUsedWei: bigint;
  gasCostUSD: number;
  success: boolean;
  timestamp: number;
  positionId?: string;
  action?: string;
}

export class MetricsCollector {
  private records: TxRecord[] = [];
  private resetDate: string;

  constructor() {
    this.resetDate = this.today();
  }

  // ---------------------------------------------------------------------------
  // Record
  // ---------------------------------------------------------------------------

  recordTx(record: TxRecord): void {
    this.maybeReset();
    this.records.push(record);
  }

  recordFailure(positionId: string, reason: string): void {
    this.maybeReset();
    this.records.push({
      txHash: '',
      gasUsedWei: 0n,
      gasCostUSD: 0,
      success: false,
      timestamp: Date.now(),
      positionId,
      action: reason,
    });
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  snapshot(): MetricSnapshot {
    this.maybeReset();
    const todayRecords = this.todayRecords();
    const dailyGasSpentWei = todayRecords.reduce((acc, r) => acc + r.gasUsedWei, 0n);
    const dailyGasSpentUSD = todayRecords.reduce((acc, r) => acc + r.gasCostUSD, 0);
    const dailyTxCount = todayRecords.filter(r => r.txHash !== '').length;
    const dailyFailureCount = todayRecords.filter(r => !r.success).length;
    const failureRate = dailyTxCount > 0 ? dailyFailureCount / dailyTxCount : 0;

    return {
      dailyGasSpentWei,
      dailyGasSpentUSD,
      dailyTxCount,
      dailyFailureCount,
      failureRate,
      lastResetAt: new Date(this.resetDate).getTime(),
      lastUpdatedAt: Date.now(),
    };
  }

  // ---------------------------------------------------------------------------
  // Prometheus text format
  // ---------------------------------------------------------------------------

  serialize(): string {
    const s = this.snapshot();
    const lines = [
      '# HELP ratio_daily_tx_count Total transactions today',
      '# TYPE ratio_daily_tx_count gauge',
      `ratio_daily_tx_count ${s.dailyTxCount}`,
      '',
      '# HELP ratio_daily_failure_count Failed transactions today',
      '# TYPE ratio_daily_failure_count gauge',
      `ratio_daily_failure_count ${s.dailyFailureCount}`,
      '',
      '# HELP ratio_failure_rate Failure rate 0-1',
      '# TYPE ratio_failure_rate gauge',
      `ratio_failure_rate ${s.failureRate.toFixed(4)}`,
      '',
      '# HELP ratio_daily_gas_usd Daily gas spend in USD',
      '# TYPE ratio_daily_gas_usd gauge',
      `ratio_daily_gas_usd ${s.dailyGasSpentUSD.toFixed(4)}`,
      '',
      `# last_reset_at ${new Date(s.lastResetAt).toISOString()}`,
      `# last_updated_at ${new Date(s.lastUpdatedAt).toISOString()}`,
    ];
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Utils
  // ---------------------------------------------------------------------------

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private maybeReset(): void {
    const t = this.today();
    if (t !== this.resetDate) {
      this.records = [];
      this.resetDate = t;
    }
  }

  private todayRecords(): TxRecord[] {
    const cutoff = new Date(this.resetDate).getTime();
    return this.records.filter(r => r.timestamp >= cutoff);
  }

  clearAll(): void {
    this.records = [];
  }
}
