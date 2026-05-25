export interface ValidationResult {
  valid: boolean;
  stage: ValidationStage;
  errors: string[];
  timestamp: number;
}

export type ValidationStage = 'pre_execution' | 'simulation' | 'safety_limits' | 'final_approval';

export interface ValidationConfig {
  maxPositionSizeUSD: bigint;
  dailyTxLimit: number;
  approvalThresholdUSD: bigint;
}
