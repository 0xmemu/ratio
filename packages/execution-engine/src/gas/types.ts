/**
 * Gas estimation and optimization types for Phase 3
 * Handles EIP-1559 gas pricing and transaction cost management
 */

export interface GasConfig {
  /** Maximum acceptable gas price in gwei */
  maxGasPrice: bigint;
  
  /** Maximum priority fee (tip) in gwei */
  maxPriorityFee: bigint;
  
  /** Gas limit buffer percentage (e.g., 1.2 = 20% buffer) */
  gasLimitBuffer: number;
  
  /** Timeout for gas estimation in milliseconds */
  estimationTimeout: number;
  
  /** Number of retry attempts for failed estimations */
  retryAttempts: number;
}

export interface GasEstimation {
  /** Base fee per gas (EIP-1559) */
  baseFee: bigint;
  
  /** Suggested priority fee */
  priorityFee: bigint;
  
  /** Estimated gas limit */
  gasLimit: bigint;
  
  /** Total estimated cost in wei */
  totalCost: bigint;
  
  /** Timestamp of estimation */
  timestamp: number;
}

export interface GasPrice {
  /** Current base fee */
  baseFee: bigint;
  
  /** Recommended priority fee for fast confirmation */
  fast: bigint;
  
  /** Recommended priority fee for standard confirmation */
  standard: bigint;
  
  /** Recommended priority fee for slow confirmation */
  slow: bigint;
}

export type GasSource = 'blocknative' | 'etherscan' | 'rpc';

export interface GasMonitoring {
  /** Position ID being monitored */
  positionId: string;
  
  /** Total gas spent in wei */
  totalGasSpent: bigint;
  
  /** Number of transactions */
  txCount: number;
  
  /** Average gas price used */
  avgGasPrice: bigint;
}
