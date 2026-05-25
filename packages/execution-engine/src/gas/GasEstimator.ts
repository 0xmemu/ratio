import { ethers } from 'ethers';
import type { GasConfig, GasEstimation, GasPrice, GasSource } from './types';

/**
 * Gas Estimation Service for Phase 3
 * Handles real-time gas price fetching, estimation, and optimization
 */
export class GasEstimator {
  private config: GasConfig;
  private provider: ethers.Provider;
  private sources: GasSource[] = ['blocknative', 'etherscan', 'rpc'];

  constructor(provider: ethers.Provider, config: GasConfig) {
    this.provider = provider;
    this.config = config;
  }

  /**
   * Estimate current gas price with EIP-1559 support
   * @returns Gas price estimation
   */
  async estimateGasPrice(): Promise<GasPrice> {
    const feeData = await this.provider.getFeeData();

    if (!feeData.gasPrice) {
      throw new Error('Unable to fetch gas price');
    }

    const baseFee = feeData.gasPrice;
    
    // Calculate priority fees for different confirmation speeds
    const fast = (baseFee * 150n) / 100n; // 50% higher for fast
    const standard = (baseFee * 120n) / 100n; // 20% higher for standard
    const slow = (baseFee * 105n) / 100n; // 5% higher for slow

    return {
      baseFee,
      fast,
      standard,
      slow,
    };
  }

  /**
   * Estimate gas limit for a transaction
   * @param transaction Transaction object to estimate
   * @returns Estimated gas limit with buffer
   */
  async estimateGasLimit(transaction: ethers.TransactionRequest): Promise<bigint> {
    try {
      const estimate = await this.provider.estimateGas(transaction);
      
      // Apply buffer to gas limit
      const buffered = BigInt(Math.floor(Number(estimate) * this.config.gasLimitBuffer));
      
      return buffered;
    } catch (error) {
      console.error('Gas estimation failed:', error);
      throw new Error(`Gas estimation failed: ${error}`);
    }
  }

  /**
   * Get complete gas estimation for a transaction
   * @param transaction Transaction to estimate
   * @returns Complete gas estimation
   */
  async estimate(transaction: ethers.TransactionRequest): Promise<GasEstimation> {
    const [gasPrice, gasLimit] = await Promise.all([
      this.estimateGasPrice(),
      this.estimateGasLimit(transaction),
    ]);

    const priorityFee = gasPrice.standard;
    const totalCost = (gasPrice.baseFee + priorityFee) * gasLimit;

    return {
      baseFee: gasPrice.baseFee,
      priorityFee,
      gasLimit,
      totalCost,
      timestamp: Date.now(),
    };
  }

  /**
   * Validate if gas cost is within budget
   * @param estimation Gas estimation to validate
   * @returns True if within budget
   */
  validateGasBudget(estimation: GasEstimation): boolean {
    const maxCost = this.config.maxGasPrice * estimation.gasLimit;
    return estimation.totalCost <= maxCost;
  }

  /**
   * Find optimal timing for execution based on gas prices
   * @returns Recommendation for execution
   */
  async optimizeGasCost(): Promise<{ shouldExecute: boolean; reason: string }> {
    const gasPrice = await this.estimateGasPrice();

    if (gasPrice.baseFee > this.config.maxGasPrice) {
      return {
        shouldExecute: false,
        reason: `Gas price ${gasPrice.baseFee} exceeds max ${this.config.maxGasPrice}`,
      };
    }

    if (gasPrice.standard <= gasPrice.slow) {
      return {
        shouldExecute: true,
        reason: 'Gas prices are favorable',
      };
    }

    return {
      shouldExecute: true,
      reason: 'Gas prices acceptable',
    };
  }
}
