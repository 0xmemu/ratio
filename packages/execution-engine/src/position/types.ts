export interface PositionConfig {
  /** Slippage tolerance in bps, e.g. 50 = 0.5% */
  slippageBps: number;
  /** Transaction deadline in minutes from submission */
  deadlineMinutes: number;
  /** Confirmations to wait before marking tx confirmed */
  confirmationsRequired: number;
  /** Max position size in token0 raw units */
  maxPositionSize: bigint;
  /** Uniswap v3 NFT Position Manager address */
  nftManagerAddress: string;
  /** Uniswap v3 Quoter v2 address */
  quoterAddress: string;
}

export interface PositionParams {
  /** Pool address */
  poolAddress: string;
  /** token0 contract address */
  token0: string;
  /** token1 contract address */
  token1: string;
  /** Pool fee tier in bps*100, e.g. 3000 = 0.3% */
  fee: number;
  tickLower: number;
  tickUpper: number;
  /** Desired amount of token0 (raw units) */
  amount0Desired: bigint;
  /** Desired amount of token1 (raw units) */
  amount1Desired: bigint;
  /** Recipient of LP NFT */
  recipient: string;
}

export interface PositionResult {
  tokenId: bigint;
  liquidity: bigint;
  amount0: bigint;
  amount1: bigint;
  txHash: string;
}

export interface CollectResult {
  amount0: bigint;
  amount1: bigint;
  txHash: string;
}

export interface DecreaseResult {
  amount0: bigint;
  amount1: bigint;
  txHash: string;
}
