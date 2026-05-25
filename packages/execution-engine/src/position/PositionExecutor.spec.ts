import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { PositionExecutor } from './PositionExecutor';
import type { PositionConfig, PositionParams } from './types';

describe('PositionExecutor', () => {
  let positionExecutor: PositionExecutor;
  let mockProvider: ethers.Provider;
  let config: PositionConfig;

  beforeEach(() => {
    mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 1n }),
    } as unknown as ethers.Provider;

    config = {
      slippageTolerance: 0.005,
      deadlineMinutes: 20,
    };

    positionExecutor = new PositionExecutor(mockProvider, config);
  });

  describe('openPosition', () => {
    it('should return position ID placeholder', async () => {
      const params: PositionParams = {
        token0: '0x1234567890123456789012345678901234567890',
        token1: '0x0987654321098765432109876543210987654321',
        amount0: 10n ** 18n,
        amount1: 10n ** 18n,
        tickLower: -887272,
        tickUpper: 887272,
      };

      const result = await positionExecutor.openPosition(params);
      expect(result).toBe('position_id_placeholder');
    });
  });

  describe('closePosition', () => {
    it('should log position closure', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const positionId = 'position-123';

      await positionExecutor.closePosition(positionId);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Closing position'),
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('rebalancePosition', () => {
    it('should rebalance position successfully', async () => {
      const positionId = 'position-123';
      const newParams: PositionParams = {
        token0: '0x1234567890123456789012345678901234567890',
        token1: '0x0987654321098765432109876543210987654321',
        amount0: 5n ** 18n,
        amount1: 5n ** 18n,
        tickLower: -887272,
        tickUpper: 887272,
      };

      const result = await positionExecutor.rebalancePosition(positionId, newParams);
      expect(result).toBe('position_id_placeholder');
    });
  });
});
