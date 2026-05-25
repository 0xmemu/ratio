/**
 * @ratio/protocol-v3
 * Uniswap v3 adapter - primary live execution venue in v1
 * Concentrated liquidity: fee generation tied to active in-range liquidity
 */

export const UNISWAP_V3_FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
export const UNISWAP_V3_NPM = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'; // NonfungiblePositionManager
export const UNISWAP_V3_QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
export const UNISWAP_V3_SWAP_ROUTER_02 = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';

export type FeeTier = 100 | 500 | 3000 | 10000;
export const ALLOWED_FEE_TIERS: FeeTier[] = [500, 3000];

export interface PoolKey {
  token0: string;
  token1: string;
  fee: FeeTier;
}

export interface PoolState {
  sqrtPriceX96: bigint;
  tick: number;
  observationIndex: number;
  liquidity: bigint;
  feeGrowthGlobal0X128: bigint;
  feeGrowthGlobal1X128: bigint;
}

export interface PositionInfo {
  tokenId: bigint;
  token0: string;
  token1: string;
  fee: FeeTier;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}

export interface MintParams {
  token0: string;
  token1: string;
  fee: FeeTier;
  tickLower: number;
  tickUpper: number;
  amount0Desired: bigint;
  amount1Desired: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  recipient: string;
  deadline: bigint;
}

export interface CollectParams {
  tokenId: bigint;
  recipient: string;
  amount0Max: bigint;
  amount1Max: bigint;
}

export interface DecreaseLiquidityParams {
  tokenId: bigint;
  liquidity: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  deadline: bigint;
}

// Tick math helpers
export function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

export function priceToTick(price: number): number {
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

export function nearestUsableTick(tick: number, tickSpacing: number): number {
  return Math.round(tick / tickSpacing) * tickSpacing;
}

export function getTickSpacing(fee: FeeTier): number {
  const spacings: Record<FeeTier, number> = {
    100: 1,
    500: 10,
    3000: 60,
    10000: 200,
  };
  return spacings[fee];
}
