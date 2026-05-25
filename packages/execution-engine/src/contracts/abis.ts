/**
 * Contract ABIs for Uniswap v3 Integration
 * 
 * Essential contract interfaces for Phase 3 Milestone 3:
 * - ERC20 Token
 * - Uniswap V3 NFT Position Manager
 * - Uniswap V3 Pool
 */

// ERC20 Token ABI - For token approvals and balance checks
export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
] as const;

// Uniswap V3 Non-Fungible Position Manager ABI
// Used for minting, increasing, decreasing, and collecting positions
export const UNISWAP_V3_NFT_MANAGER_ABI = [
  // Position Management
  'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  
  'function increaseLiquidity((uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)',
  
  'function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint256 amount0, uint256 amount1)',
  
  'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) external payable returns (uint256 amount0, uint256 amount1)',
  
  'function burn(uint256 tokenId) external payable',
  
  // Position Info
  'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  
  'function ownerOf(uint256 tokenId) external view returns (address)',
] as const;

// Uniswap V3 Pool ABI
// Used for querying pool state and slot0 (current price/tick)
export const UNISWAP_V3_POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  
  'function liquidity() external view returns (uint128)',
  
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
  
  'function tickSpacing() external view returns (int24)',
  
  'function observe(uint32[] secondsAgos) external view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)',
] as const;

// Uniswap V3 Factory ABI
// Used for getting pool addresses
export const UNISWAP_V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
  'function owner() external view returns (address)',
] as const;

// Uniswap V3 Quoter ABI
// Used for simulating swaps and getting quotes
export const UNISWAP_V3_QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  
  'function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
] as const;

// Type exports for TypeScript
export type ERC20ABI = typeof ERC20_ABI;
export type UniswapV3NFTManagerABI = typeof UNISWAP_V3_NFT_MANAGER_ABI;
export type UniswapV3PoolABI = typeof UNISWAP_V3_POOL_ABI;
export type UniswapV3FactoryABI = typeof UNISWAP_V3_FACTORY_ABI;
export type UniswapV3QuoterABI = typeof UNISWAP_V3_QUOTER_ABI;
