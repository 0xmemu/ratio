import { ethers } from 'ethers';

export interface GasEstimateRequest {
  to?: string;
  data?: string;
  value?: bigint;
}

export interface GasEstimateResult {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  estimatedCostWei: bigint;
  estimatedCostEth: string;
  estimatedCostUsd: number;
  timestamp: number;
}

export interface GasEstimatorConfig {
  rpcUrl: string;
  maxGasPriceGwei: number;
  maxPriorityFeeGwei: number;
  ethPriceUsd: number;
  fallbackGasLimit?: bigint;
}

export class GasEstimator {
  private provider: ethers.JsonRpcProvider;
  private config: GasEstimatorConfig;

  constructor(config: GasEstimatorConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  async estimate(request?: GasEstimateRequest): Promise<GasEstimateResult> {
    const feeData = await this.provider.getFeeData();

    const maxFeePerGas = feeData.maxFeePerGas ?? ethers.parseUnits('30', 'gwei');
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.parseUnits('2', 'gwei');

    const maxFeeGwei = Number(ethers.formatUnits(maxFeePerGas, 'gwei'));
    if (maxFeeGwei > this.config.maxGasPriceGwei) {
      throw new Error(`gas price exceeds ceiling: ${maxFeeGwei} gwei`);
    }

    const gasLimit = request?.to
      ? await this.provider.estimateGas({
          to: request.to,
          data: request.data,
          value: request.value ?? 0n,
        })
      : (this.config.fallbackGasLimit ?? 300000n);

    const estimatedCostWei = gasLimit * maxFeePerGas;
    const estimatedCostEth = ethers.formatEther(estimatedCostWei);
    const estimatedCostUsd = Number(estimatedCostEth) * this.config.ethPriceUsd;

    return {
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      estimatedCostWei,
      estimatedCostEth,
      estimatedCostUsd,
      timestamp: Date.now(),
    };
  }

  async getCurrentGasPriceGwei(): Promise<number> {
    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? ethers.parseUnits('0', 'gwei');
    return Number(ethers.formatUnits(gasPrice, 'gwei'));
  }
}

export default GasEstimator;
