export interface PositionConfig {
  slippageTolerance: number;
  deadlineMinutes: number;
  confirmationsRequired: number;
  maxPositionSize: bigint;
}

export interface PositionParams {
  poolAddress: string;
  tickLower: number;
  tickUpper: number;
  amount0: bigint;
  amount1: bigint;
}
