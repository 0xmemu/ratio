import { ethers } from 'ethers';
import type { ExecutionRequest } from './index';

export interface PositionExecutorConfig {
  rpcUrl: string;
  nftManagerAddress: string;
  maxGasLimit?: bigint;
}

export interface PositionExecutionResult {
  success: boolean;
  txHash?: string;
  tokenId?: bigint;
  liquidity?: bigint;
  error?: string;
  timestamp: number;
}

const NFT_MANAGER_ABI = [
  'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) external payable returns (uint256 amount0, uint256 amount1)',
];

export class PositionExecutor {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private maxGasLimit: bigint;

  constructor(config: PositionExecutorConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.contract = new ethers.Contract(
      config.nftManagerAddress,
      NFT_MANAGER_ABI,
      this.provider
    );

    this.maxGasLimit = config.maxGasLimit ?? 300000n;
  }

  async collectFees(
    request: ExecutionRequest,
    signer: ethers.Wallet
  ): Promise<PositionExecutionResult> {
    try {
      if (!request.tokenId) {
        throw new Error('tokenId required');
      }

      const connected = this.contract.connect(signer);

      const tx = await connected.collect(
        [
          request.tokenId,
          request.recipient,
          ethers.MaxUint256,
          ethers.MaxUint256,
        ],
        {
          gasLimit: this.maxGasLimit,
        }
      );

      const receipt = await tx.wait();

      return {
        success: receipt?.status === 1,
        txHash: tx.hash,
        timestamp: Date.now(),
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      };
    }
  }
}

export default PositionExecutor;
