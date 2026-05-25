import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationPipeline } from './ValidationPipeline';
import type { ValidationConfig } from './types';

describe('ValidationPipeline', () => {
  let pipeline: ValidationPipeline;
  let config: ValidationConfig;

  beforeEach(() => {
    config = {
      maxSlippage: 0.05,
      maxPositionSize: 10n ** 18n, // 1 ETH
      minGasBalance: 10n ** 17n, // 0.1 ETH
    };

    pipeline = new ValidationPipeline(config);
  });

  describe('validatePreExecution', () => {
    it('should pass validation for valid inputs', async () => {
      const result = await pipeline.validatePreExecution();
      expect(result.valid).toBe(true);
      expect(result.stage).toBe('pre_execution');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('simulateTransaction', () => {
    it('should simulate transaction successfully', async () => {
      const result = await pipeline.simulateTransaction();
      expect(result.valid).toBe(true);
      expect(result.stage).toBe('simulation');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateSafetyLimits', () => {
    it('should validate safety limits', async () => {
      const result = await pipeline.validateSafetyLimits();
      expect(result.valid).toBe(true);
      expect(result.stage).toBe('safety_limits');
      expect(result.errors).toHaveLength(0);
    });
  });
});
