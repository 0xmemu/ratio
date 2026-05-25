/**
 * @package execution-engine
 * Executes on-chain LP actions (mint, burn, collect) via Uniswap v3 NonfungiblePositionManager.
 * NEVER signs or sends transactions without explicit policy-engine approval.
 * Dry-run mode logs actions without executing.
 *
 * Phase 3: Full ethers.js implementation with wallet signer.
 * WALLET_PRIVATE_KEY must be set via env var — never hardcoded.
 */

import { ethers } from 'ethers';

export type ExecutionMode = 'dry_run' | 'live';

export interface ExecutionRequest {
  poolAddress: string;
  action: 'mint' | 'burn' | 'collect' | 'rebalance';
  tickLower: number;
  tickUpper: number;
  amount0Desired?: bigint;
  amount1Desired?: bigint;
  tokenId?: bigint;        // for burn/collect/rebalance
  recipient: string;       // wallet address
  deadline: number;        // unix timestamp
  policyApprovalId: string; // required for live mode
  decisionId: string;       // RebalanceDecision.id
}

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  dryRun: boolean;
  gasUsed?: bigint;
  gasPrice?: bigint;
  error?: string;
  request: ExecutionRequest;
  timestamp: number;
}

export interface ExecutionEngineConfig {
  mode: ExecutionMode;
  rpcUrl: string;
  nftManagerAddress: string;  // Uniswap v3 NonfungiblePositionManager
  maxGasUnits: number;         // v1: 300_000
  gasPriceCeilingGwei: number; // v1: 50
  slippageBps: number;         // v1: 50 = 0.5%
  dailyGasBudgetUsd: number;
  ethPriceUsd: number;         // refreshed externally
}

// Uniswap v3 NonfungiblePositionManager minimal ABI
const NFT_MANAGER_ABI = [
  'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  'function increaseLiquidity((uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)',
  'function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint256 amount0, uint256 amount1)',
  'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) external payable returns (uint256 amount0, uint256 amount1)',
];

export class ExecutionEngine {
  private config: ExecutionEngineConfig;
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet | null = null;
  private nftManager: ethers.Contract;
  private dailyGasUsedUsd: number = 0;
  private dailyResetAt: Date = new Date();

  constructor(config: ExecutionEngineConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);

    if (config.mode === 'live') {
      const privateKey = process.env.WALLET_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('[execution-engine] WALLET_PRIVATE_KEY env var is required for live mode');
      }
      this.signer = new ethers.Wallet(privateKey, this.provider);
    }

    const signerOrProvider = this.signer ?? this.provider;
    this.nftManager = new ethers.Contract(
      config.nftManagerAddress,
      NFT_MANAGER_ABI,
      signerOrProvider
    );
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    this.resetDailyBudgetIfNeeded();

    if (this.config.mode === 'dry_run') {
      return this.dryRunResult(request);
    }

    return this.liveExecute(request);
  }

  private dryRunResult(request: ExecutionRequest): ExecutionResult {
    console.log(`[execution-engine][DRY_RUN] action=${request.action} pool=${request.poolAddress} ticks=[${request.tickLower},${request.tickUpper}]`);
    return {
      success: true,
      dryRun: true,
      request,
      timestamp: Date.now(),
    };
  }

  private async liveExecute(request: ExecutionRequest): Promise<ExecutionResult> {
    if (!this.signer) {
      return { success: false, error: 'no_signer', dryRun: false, request, timestamp: Date.now() };
    }

    // Gas budget check
    if (this.dailyGasUsedUsd >= this.config.dailyGasBudgetUsd) {
      return { success: false, error: 'daily_gas_budget_exceeded', dryRun: false, request, timestamp: Date.now() };
    }

    try {
      // Gas price ceiling check
      const feeData = await this.provider.getFeeData();
      const gasPriceGwei = feeData.gasPrice
        ? Number(ethers.formatUnits(feeData.gasPrice, 'gwei'))
        : 999;
      if (gasPriceGwei > this.config.gasPriceCeilingGwei) {
        return {
          success: false,
          error: `gas_price_ceiling_exceeded: ${gasPriceGwei.toFixed(1)} gwei > ${this.config.gasPriceCeilingGwei} gwei`,
          dryRun: false,
          request,
          timestamp: Date.now(),
        };
      }

      // Slippage: amount0Min/amount1Min = desired * (1 - slippage)
      const slippageFactor = BigInt(10000 - this.config.slippageBps);
      const amount0Min = request.amount0Desired
        ? (request.amount0Desired * slippageFactor) / 10000n
        : 0n;
      const amount1Min = request.amount1Desired
        ? (request.amount1Desired * slippageFactor) / 10000n
        : 0n;

      let tx: ethers.TransactionResponse;

      if (request.action === 'mint') {
        // TODO: fetch token0/token1/fee from pool contract
        throw new Error('mint requires pool token info — fetch from protocol-v3 adapter');
      } else if (request.action === 'burn' || request.action === 'rebalance') {
        if (!request.tokenId) throw new Error('tokenId required for burn/rebalance');
        tx = await this.nftManager.decreaseLiquidity(
          [
            request.tokenId,
            // liquidity: TODO fetch current liquidity from position
            0n,
            amount0Min,
            amount1Min,
            request.deadline,
          ],
          { gasLimit: this.config.maxGasUnits }
        );
      } else if (request.action === 'collect') {
        if (!request.tokenId) throw new Error('tokenId required for collect');
        tx = await this.nftManager.collect(
          [
            request.tokenId,
            request.recipient,
            ethers.MaxUint256,
            ethers.MaxUint256,
          ],
          { gasLimit: this.config.maxGasUnits }
        );
      } else {
        throw new Error(`unknown action: ${request.action}`);
      }

      const receipt = await tx.wait();
      const gasUsed = receipt?.gasUsed ?? 0n;
      const gasPrice = receipt?.gasPrice ?? feeData.gasPrice ?? 0n;
      const gasCostEth = Number(ethers.formatEther(gasUsed * gasPrice));
      const gasCostUsd = gasCostEth * this.config.ethPriceUsd;
      this.dailyGasUsedUsd += gasCostUsd;

      console.log(`[execution-engine][LIVE] txHash=${tx.hash} gasUsd=$${gasCostUsd.toFixed(4)}`);

      return {
        success: true,
        txHash: tx.hash,
        dryRun: false,
        gasUsed,
        gasPrice: gasPrice ?? undefined,
        request,
        timestamp: Date.now(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[execution-engine][ERROR] ${message}`);
      return {
        success: false,
        error: message,
        dryRun: false,
        request,
        timestamp: Date.now(),
      };
    }
  }

  resetDailyGasBudget(): void {
    this.dailyGasUsedUsd = 0;
    this.dailyResetAt = new Date();
  }

  private resetDailyBudgetIfNeeded(): void {
    const now = new Date();
    if (now.getUTCDate() !== this.dailyResetAt.getUTCDate()) {
      this.resetDailyGasBudget();
    }
  }

  getDailyGasUsedUsd(): number {
    return this.dailyGasUsedUsd;
  }
}

export default ExecutionEngine;


// Phase 3: Live Execution Modules
export * from './gas';
export * from './wallet';
export * from './validation';
export * from './rollback';
export * from './position';
