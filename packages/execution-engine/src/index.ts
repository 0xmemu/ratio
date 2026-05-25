/**
 * @package execution-engine
 * Phase 3 completed execution engine.
 */

import { ethers } from 'ethers';
import { ValidationPipeline } from './validation';

export type ExecutionMode = 'dry_run' | 'live';

export interface ExecutionRequest {
  poolAddress: string;
  action: 'mint' | 'burn' | 'collect' | 'rebalance';
  tickLower: number;
  tickUpper: number;
  amount0Desired?: bigint;
  amount1Desired?: bigint;
  tokenId?: bigint;
  recipient: string;
  deadline: number;
  policyApprovalId: string;
  decisionId: string;
  token0?: string;
  token1?: string;
  fee?: number;
}

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  dryRun: boolean;
  gasUsed?: bigint;
  gasPrice?: bigint;
  error?: string;
  validationErrors?: string[];
  request: ExecutionRequest;
  timestamp: number;
}

export interface ExecutionEngineConfig {
  mode: ExecutionMode;
  rpcUrl: string;
  nftManagerAddress: string;
  maxGasUnits: number;
  gasPriceCeilingGwei: number;
  slippageBps: number;
  dailyGasBudgetUsd: number;
  ethPriceUsd: number;
}

const NFT_MANAGER_ABI = [
  'function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) external payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)',
  'function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) external payable returns (uint256 amount0,uint256 amount1)',
  'function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) external payable returns (uint256 amount0,uint256 amount1)',
];

export class ExecutionEngine {
  private config: ExecutionEngineConfig;
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet | null = null;
  private nftManager: ethers.Contract;
  private validation: ValidationPipeline;
  private dailyGasUsedUsd = 0;
  private dailyResetAt = new Date();

  constructor(config: ExecutionEngineConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);

    this.validation = new ValidationPipeline({
      rpcUrl: config.rpcUrl,
      maxGasPriceGwei: config.gasPriceCeilingGwei,
      minimumBalanceEth: 0.01,
    });

    if (config.mode === 'live') {
      const privateKey = process.env.WALLET_PRIVATE_KEY;

      if (!privateKey) {
        throw new Error('WALLET_PRIVATE_KEY required');
      }

      this.signer = new ethers.Wallet(privateKey, this.provider);
    }

    this.nftManager = new ethers.Contract(
      config.nftManagerAddress,
      NFT_MANAGER_ABI,
      this.signer ?? this.provider
    );
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    this.resetDailyBudgetIfNeeded();

    const validation = await this.validation.validate(request, this.config);

    if (!validation.valid) {
      return {
        success: false,
        dryRun: this.config.mode === 'dry_run',
        validationErrors: validation.errors,
        error: 'validation_failed',
        request,
        timestamp: Date.now(),
      };
    }

    if (this.config.mode === 'dry_run') {
      return {
        success: true,
        dryRun: true,
        request,
        timestamp: Date.now(),
      };
    }

    return this.liveExecute(request);
  }

  private async liveExecute(request: ExecutionRequest): Promise<ExecutionResult> {
    if (!this.signer) {
      return {
        success: false,
        dryRun: false,
        error: 'no_signer',
        request,
        timestamp: Date.now(),
      };
    }

    try {
      const feeData = await this.provider.getFeeData();

      const slippageFactor = BigInt(10000 - this.config.slippageBps);

      const amount0Min = request.amount0Desired
        ? (request.amount0Desired * slippageFactor) / 10000n
        : 0n;

      const amount1Min = request.amount1Desired
        ? (request.amount1Desired * slippageFactor) / 10000n
        : 0n;

      let tx: ethers.TransactionResponse;

      if (request.action === 'mint') {
        if (!request.token0 || !request.token1 || !request.fee) {
          throw new Error('missing token metadata');
        }

        tx = await this.nftManager.mint(
          [
            request.token0,
            request.token1,
            request.fee,
            request.tickLower,
            request.tickUpper,
            request.amount0Desired ?? 0n,
            request.amount1Desired ?? 0n,
            amount0Min,
            amount1Min,
            request.recipient,
            request.deadline,
          ],
          {
            gasLimit: this.config.maxGasUnits,
          }
        );
      } else if (request.action === 'collect') {
        if (!request.tokenId) {
          throw new Error('tokenId required');
        }

        tx = await this.nftManager.collect(
          [
            request.tokenId,
            request.recipient,
            ethers.MaxUint256,
            ethers.MaxUint256,
          ],
          {
            gasLimit: this.config.maxGasUnits,
          }
        );
      } else {
        if (!request.tokenId) {
          throw new Error('tokenId required');
        }

        tx = await this.nftManager.decreaseLiquidity(
          [request.tokenId, 0n, amount0Min, amount1Min, request.deadline],
          {
            gasLimit: this.config.maxGasUnits,
          }
        );
      }

      const receipt = await tx.wait();

      const gasUsed = receipt?.gasUsed ?? 0n;
      const gasPrice = receipt?.gasPrice ?? feeData.gasPrice ?? 0n;

      const gasCostEth = Number(ethers.formatEther(gasUsed * gasPrice));

      this.dailyGasUsedUsd += gasCostEth * this.config.ethPriceUsd;

      return {
        success: true,
        txHash: tx.hash,
        dryRun: false,
        gasUsed,
        gasPrice,
        request,
        timestamp: Date.now(),
      };
    } catch (err: unknown) {
      return {
        success: false,
        dryRun: false,
        error: err instanceof Error ? err.message : String(err),
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
}

export * from './gas';
export * from './wallet';
export * from './validation';
export * from './rollback';
export * from './position';
