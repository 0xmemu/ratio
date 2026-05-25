export interface RollbackConfig {
  maxRetryAttempts: number;
  retryBackoffMs: number;
  autoRollbackEnabled: boolean;
  alertThreshold: number;
}

export type RollbackReason = 'tx_failed' | 'slippage_exceeded' | 'gas_spike' | 'balance_insufficient';
