/**
 * Wallet management types for Phase 3
 * Handles hot wallet operations with security best practices
 */

export interface WalletConfig {
  /** Environment variable name containing private key */
  privateKeyEnv: string;
  
  /** Minimum ETH balance required (wei) */
  minEthBalance: bigint;
  
  /** Maximum daily gas spend limit (wei) */
  maxDailyGasSpend: bigint;
  
  /** Nonce management strategy */
  nonceStrategy: 'sequential' | 'parallel';
  
  /** Require manual approval for transactions */
  requiresApproval: boolean;
}

export interface WalletInfo {
  /** Wallet address */
  address: string;
  
  /** Current ETH balance (wei) */
  balance: bigint;
  
  /** Current nonce */
  nonce: number;
  
  /** Total gas spent today (wei) */
  dailyGasSpent: bigint;
  
  /** Last updated timestamp */
  lastUpdated: number;
}

export interface TransactionRequest {
  /** Recipient address */
  to: string;
  
  /** Transaction data */
  data?: string;
  
  /** Value to send (wei) */
  value?: bigint;
  
  /** Gas limit */
  gasLimit?: bigint;
  
  /** Max fee per gas (EIP-1559) */
  maxFeePerGas?: bigint;
  
  /** Max priority fee per gas (EIP-1559) */
  maxPriorityFeePerGas?: bigint;
}

export interface SignedTransaction {
  /** Transaction hash */
  hash: string;
  
  /** Raw signed transaction */
  rawTransaction: string;
  
  /** Nonce used */
  nonce: number;
  
  /** Timestamp of signing */
  signedAt: number;
}

export interface WalletAuditLog {
  /** Log entry ID */
  id: string;
  
  /** Wallet address */
  walletAddress: string;
  
  /** Operation type */
  operation: 'sign' | 'send' | 'balance_check';
  
  /** Transaction hash (if applicable) */
  txHash?: string;
  
  /** Gas used (wei) */
  gasUsed?: bigint;
  
  /** Status */
  status: 'success' | 'failed';
  
  /** Timestamp */
  timestamp: number;
  
  /** Error message (if failed) */
  error?: string;
}
