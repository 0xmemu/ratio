import { describe, it, expect, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { ValidationPipeline } from './ValidationPipeline';
import type { ValidationConfig, TransactionContext } from './types';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

describe('ValidationPipeline', () => {
  let pipeline: ValidationPipeline;
  let config: ValidationConfig;

  beforeEach(() => {
    config = {
      liveEnabled: true,
      dailyTxLimit: 50,
      maxPositionSizeUSD: 10_000,
      maxGasToFeeRatio: 0.3,
      maxSlippageBps: 100,
      approvalThresholdUSD: 5_000,
    };
    pipeline = new ValidationPipeline(config);
  });

  describe('validatePreExecution', () => {
    it('passes validation for valid inputs', async () => {
      const ctx: TransactionContext = {
        positionSizeUSD: 1_000,
        estimatedGasCostUSD: 10n,
        estimatedFeeGainUSD: 100n,
        slippageBps: 50,
        txData: {
          from: ZERO_ADDR,
          to: ZERO_ADDR,
          data: '0x',
          provider: {} as ethers.Provider,
        },
      };

      const result = await pipeline.validatePreExecution(ctx);
      expect(result.valid).toBe(true);
    });

    it('fails when live execution is disabled', async () => {
      const disabled = new ValidationPipeline({ ...config, liveEnabled: false });
      const result = await disabled.validatePreExecution();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('disabled'))).toBe(true);
    });

    it('fails when position size exceeds max', async () => {
      const ctx: TransactionContext = {
        positionSizeUSD: 50_000,
        estimatedGasCostUSD: 10n,
        estimatedFeeGainUSD: 100n,
        slippageBps: 50,
        txData: {
          from: ZERO_ADDR,
          to: ZERO_ADDR,
          data: '0x',
          provider: {} as ethers.Provider,
        },
      };

      const result = await pipeline.validatePreExecution(ctx);
      expect(result.valid).toBe(false);
    });
  });

  describe('simulateTransaction', () => {
    it('returns success when call passes', async () => {
      const mockProvider = {
        call: async () => '0xresult',
        estimateGas: async () => 21000n,
      } as unknown as ethers.Provider;

      const ctx: TransactionContext = {
        positionSizeUSD: 1_000,
        estimatedGasCostUSD: 10n,
        estimatedFeeGainUSD: 100n,
        slippageBps: 50,
        txData: {
          from: ZERO_ADDR,
          to: ZERO_ADDR,
          data: '0x',
          provider: mockProvider,
        },
      };

      const result = await pipeline.simulateTransaction(ctx);
      expect(result.success).toBe(true);
    });

    it('returns failure when call reverts', async () => {
      const mockProvider = {
        call: async () => { throw new Error('execution reverted: insufficient balance'); },
      } as unknown as ethers.Provider;

      const ctx: TransactionContext = {
        positionSizeUSD: 1_000,
        estimatedGasCostUSD: 10n,
        estimatedFeeGainUSD: 100n,
        slippageBps: 50,
        txData: {
          from: ZERO_ADDR,
          to: ZERO_ADDR,
          data: '0x',
          provider: mockProvider,
        },
      };

      const result = await pipeline.simulateTransaction(ctx);
      expect(result.success).toBe(false);
      expect(result.revertReason).toBeDefined();
    });
  });

  describe('validateSafetyLimits', () => {
    it('validates safety limits successfully', async () => {
      const ctx: TransactionContext = {
        positionSizeUSD: 2_000,
        estimatedGasCostUSD: 10n,
        estimatedFeeGainUSD: 100n,
        slippageBps: 50,
        txData: {
          from: ZERO_ADDR,
          to: ZERO_ADDR,
          data: '0x',
          provider: {} as ethers.Provider,
        },
      };

      const result = await pipeline.validateSafetyLimits(ctx);
      expect(result.valid).toBe(true);
    });

    it('fails when fee gain is zero', async () => {
      const ctx: TransactionContext = {
        positionSizeUSD: 2_000,
        estimatedGasCostUSD: 10n,
        estimatedFeeGainUSD: 0n,
        slippageBps: 50,
        txData: {
          from: ZERO_ADDR,
          to: ZERO_ADDR,
          data: '0x',
          provider: {} as ethers.Provider,
        },
      };

      const result = await pipeline.validateSafetyLimits(ctx);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('zero'))).toBe(true);
    });
  });

  describe('validate (full pipeline)', () => {
    it('passes all 3 stages', async () => {
      const mockProvider = {
        call: async () => '0xresult',
        estimateGas: async () => 21000n,
      } as unknown as ethers.Provider;

      const ctx: TransactionContext = {
        positionSizeUSD: 2_000,
        estimatedGasCostUSD: 10n,
        estimatedFeeGainUSD: 100n,
        slippageBps: 50,
        txData: {
          from: ZERO_ADDR,
          to: ZERO_ADDR,
          data: '0x',
          provider: mockProvider,
        },
      };

      const result = await pipeline.validate(ctx);
      expect(result.passed).toBe(true);
    });

    it('requires approval above threshold', async () => {
      const mockProvider = {
        call: async () => '0xresult',
        estimateGas: async () => 21000n,
      } as unknown as ethers.Provider;

      const ctx: TransactionContext = {
        positionSizeUSD: 6_000,
        estimatedGasCostUSD: 10n,
        estimatedFeeGainUSD: 100n,
        slippageBps: 50,
        txData: {
          from: ZERO_ADDR,
          to: ZERO_ADDR,
          data: '0x',
          provider: mockProvider,
        },
      };

      const result = await pipeline.validate(ctx);
      expect(result.requiresApproval).toBe(true);
    });
  });

  describe('daily tx tracking', () => {
    it('starts at 0 for today', () => {
      expect(pipeline.getDailyTxCount()).toBe(0);
    });

    it('increments after recordTransaction', () => {
      pipeline.recordTransaction();
      expect(pipeline.getDailyTxCount()).toBe(1);
    });
  });
});
