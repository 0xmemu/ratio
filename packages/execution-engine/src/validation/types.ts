import type { ethers } from 'ethers';

export interface ValidationResult {
  valid: boolean;
  stage: ValidationStage;
  errors: string[];
  warnings: string[];
  timestamp: number;
}

export type ValidationStage = 'pre_execution' | 'simulation' | 'safety_limits' | 'final_approval';

export interface ValidationConfig {
  /** Max single position size in USD (scaled by 1e6) */
  maxPositionSizeUSD: bigint;
  /** Max daily transaction count */
  dailyTxLimit: number;
  /** Positions above this USD threshold require explicit approval */
  approvalThresholdUSD: bigint;
  /** Max gas cost as fraction of expected fee gain (e.g. 0.35 = 35%) */
  maxGasToFeeRatio: number;
  /** Max slippage in bps (e.g. 80 = 0.80%) */
  maxSlippageBps: number;
  /** Whether live execution is enabled at all */
  liveEnabled: boolean;
}

export interface SimulationParams {
  provider: ethers.Provider;
  from: string;
  to: string;
  data: string;
  value?: bigint;
}

export interface SimulationResult {
  success: boolean;
  gasUsed?: bigint;
  revertReason?: string;
  returnData?: string;
}

export interface TransactionContext {
  positionSizeUSD: bigint;
  estimatedGasCostUSD: bigint;
  estimatedFeeGainUSD: bigint;
  slippageBps: number;
  txData: SimulationParams;
}

export interface DailyTxTracker {
  date: string; // ISO date YYYY-MM-DD
  count: number;
}
