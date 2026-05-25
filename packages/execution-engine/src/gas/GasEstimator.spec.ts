import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { GasEstimator } from './GasEstimator';
import type { GasConfig } from './types';

describe('GasEstimator', () => {
  let gasEstimator: GasEstimator;
  let mockProvider: ethers.Provider;
  let config: GasConfig;

  beforeEach(() => {
    mockProvider = {
      getFeeData: vi.fn(),
      estimateGas: vi.fn(),
    } as unknown as ethers.Provider;

    config = {
      maxGasPrice: 100n * 10n ** 9n,
      gasLimitBuffer: 1.2,
    };

    gasEstimator = new GasEstimator(mockProvider, config);
  });

  describe('estimateGasPrice', () => {
    it('should estimate gas prices with EIP-1559', async () => {
      const mockFeeData = { gasPrice: 50n * 10n ** 9n };
      vi.spyOn(mockProvider, 'getFeeData').mockResolvedValue(mockFeeData as any);
      const result = await gasEstimator.estimateGasPrice();
      expect(result.baseFee).toBe(mockFeeData.gasPrice);
      expect(result.fast).toBeGreaterThan(result.baseFee);
    });

    it('should throw error when unavailable', async () => {
      vi.spyOn(mockProvider, 'getFeeData').mockResolvedValue({ gasPrice: null } as any);
      await expect(gasEstimator.estimateGasPrice()).rejects.toThrow('Unable to fetch gas price');
    });
  });

  describe('estimateGasLimit', () => {
    it('should estimate with buffer', async () => {
      const tx = { to: '0x1234567890123456789012345678901234567890', data: '0x' };
      vi.spyOn(mockProvider, 'estimateGas').mockResolvedValue(21000n);
      const result = await gasEstimator.estimateGasLimit(tx);
      expect(result).toBeGreaterThan(21000n);
    });
  });

  describe('validateGasBudget', () => {
    it('should validate within budget', () => {
      const estimation = {
        baseFee: 40n * 10n ** 9n,
        priorityFee: 2n * 10n ** 9n,
        gasLimit: 21000n,
        totalCost: 882000000000000n,
        timestamp: Date.now(),
      };
      expect(gasEstimator.validateGasBudget(estimation)).toBe(true);
    });
  });
});
