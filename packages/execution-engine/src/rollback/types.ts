export interface RollbackConfig {
  maxRetryAttempts: number;
  /** Base backoff in ms, doubles each retry */
  retryBackoffMs: number;
  autoRollbackEnabled: boolean;
  /** Number of consecutive failures before auto-pause is triggered */
  autoPauseThreshold: number;
}

export type RollbackReason =
  | 'tx_failed'
  | 'tx_reverted'
  | 'slippage_exceeded'
  | 'gas_spike'
  | 'balance_insufficient'
  | 'simulation_failed'
  | 'timeout';

export interface FailureRecord {
  positionId: string;
  txHash?: string;
  reason: RollbackReason;
  error: string;
  timestamp: number;
  retryCount: number;
}

export interface RetryAttempt {
  positionId: string;
  attempt: number;
  waitMs: number;
  timestamp: number;
}

export interface FailureNotifier {
  /** Called when a position enters failure/rollback state */
  onFailure(record: FailureRecord): Promise<void>;
  /** Called when system is auto-paused due to repeated failures */
  onAutoPause(reason: string, failures: FailureRecord[]): Promise<void>;
}
