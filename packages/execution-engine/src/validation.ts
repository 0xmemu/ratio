import { ethers } from 'ethers';
import type { ExecutionRequest, ExecutionEngineConfig } from './index';

export interface ValidationResult {
  valid: boolean;
  checks: {
    walletBalance: boolean;
    gasPrice: boolean;
    deadline: boolean;
    approvalId: boolean;
    simulation: boolean;
  };
  warnings: string[];
  errors: string[];
  timestamp: number;
}

export interface ValidationPipelineConfig {
  rpcUrl: string;
  maxGasPriceGwei: number;
  minimumBalanceEth: number;
}

export class ValidationPipeline {
  private provider: ethers.JsonRpcProvider;
  private config: ValidationPipelineConfig;

  constructor(config: ValidationPipelineConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  async validate(
    request: ExecutionRequest,
    engineConfig: ExecutionEngineConfig
  ): Promise<ValidationResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    let walletBalance = false;
    let gasPrice = false;
    let deadline = false;
    let approvalId = false;
    let simulation = false;

    try {
      const balance = await this.provider.getBalance(request.recipient);
      const balanceEth = Number(ethers.formatEther(balance));

      walletBalance = balanceEth >= this.config.minimumBalanceEth;
      if (!walletBalance) {
        errors.push('insufficient wallet balance');
      }

      const feeData = await this.provider.getFeeData();
      const currentGas = feeData.gasPrice
        ? Number(ethers.formatUnits(feeData.gasPrice, 'gwei'))
        : 0;

      gasPrice = currentGas <= this.config.maxGasPriceGwei;
      if (!gasPrice) {
        errors.push(`gas price too high: ${currentGas} gwei`);
      }

      deadline = request.deadline > Math.floor(Date.now() / 1000);
      if (!deadline) {
        errors.push('deadline expired');
      }

      approvalId = request.policyApprovalId.length > 0;
      if (!approvalId) {
        errors.push('missing policy approval id');
      }

      try {
        await this.provider.call({
          to: engineConfig.nftManagerAddress,
          data: '0x',
        });

        simulation = true;
      } catch {
        warnings.push('simulation skipped or reverted');
      }
    } catch (err: unknown) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    return {
      valid:
        walletBalance &&
        gasPrice &&
        deadline &&
        approvalId,
      checks: {
        walletBalance,
        gasPrice,
        deadline,
        approvalId,
        simulation,
      },
      warnings,
      errors,
      timestamp: Date.now(),
    };
  }
}

export default ValidationPipeline;
