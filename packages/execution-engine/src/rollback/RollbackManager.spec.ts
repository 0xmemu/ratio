import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { RollbackManager } from './RollbackManager';
import type { RollbackConfig, RollbackReason } from './types';

describe('RollbackManager', () => {
  let rollback: RollbackManager;
  let mockProvider: ethers.Provider;
  let config: RollbackConfig;

  beforeEach(() => {
    mockProvider = {
      getTransactionReceipt: vi.fn(),
    } as unknown as ethers.Provider;

    config = {
      maxRetryAttempts: 3,
      retryBackoffMs: 100,
      autoRollbackEnabled: false,
      autoPauseThreshold: 5,
    };

    rollback = new RollbackManager(mockProvider, config);
  });

  describe('detectFailure', () => {
    it('returns false for valid confirmed transaction', async () => {
      vi.spyOn(mockProvider, 'getTransactionReceipt').mockResolvedValue({
        status: 1,
      } as unknown as ethers.TransactionReceipt);

      const result = await rollback.detectFailure('0xabc');
      expect(result).toBe(false);
    });

    it('returns true for reverted transaction (status 0)', async () => {
      vi.spyOn(mockProvider, 'getTransactionReceipt').mockResolvedValue({
        status: 0,
      } as unknown as ethers.TransactionReceipt);

      const result = await rollback.detectFailure('0xabc');
      expect(result).toBe(true);
    });

    it('returns true when receipt is null (unmined)', async () => {
      vi.spyOn(mockProvider, 'getTransactionReceipt').mockResolvedValue(null);

      const result = await rollback.detectFailure('0xabc');
      expect(result).toBe(true);
    });
  });

  describe('rollbackPosition', () => {
    it('records failure and does not auto-rollback when disabled', async () => {
      await rollback.rollbackPosition('pos-1', 'tx_failed');

      const log = rollback.getFailureLog('pos-1');
      expect(log.length).toBe(1);
      expect(log[0].reason).toBe('tx_failed');
    });

    it('calls close callback when auto-rollback is enabled', async () => {
      const arConfig = { ...config, autoRollbackEnabled: true };
      const ar = new RollbackManager(mockProvider, arConfig);
      const closeFn = vi.fn().mockResolvedValue(undefined);

      await ar.rollbackPosition('pos-2', 'tx_reverted', closeFn);

      expect(closeFn).toHaveBeenCalledOnce();
    });

    it('records close failure when callback throws', async () => {
      const arConfig = { ...config, autoRollbackEnabled: true };
      const ar = new RollbackManager(mockProvider, arConfig);
      const closeFn = vi.fn().mockRejectedValue(new Error('close failed'));

      await ar.rollbackPosition('pos-3', 'tx_reverted', closeFn);

      const log = ar.getFailureLog('pos-3');
      expect(log.length).toBe(2); // rollback event + close failure
    });
  });

  describe('notifyFailure', () => {
    it('calls notifier onFailure when notifier is provided', async () => {
      const onFailure = vi.fn().mockResolvedValue(undefined);
      const r = new RollbackManager(mockProvider, config, { onFailure, onAutoPause: vi.fn() });

      // First record a failure
      await r.recordFailure('pos-x', '0xhash', 'tx_failed', 'test error');

      onFailure.mockClear();

      // Then notify
      await r.notifyFailure('pos-x', 'tx_failed');
      expect(onFailure).toHaveBeenCalledOnce();
    });
  });

  describe('pause/resume', () => {
    it('is not paused initially', () => {
      expect(rollback.isPaused()).toBe(false);
    });

    it('auto-pauses after threshold failures', async () => {
      for (let i = 0; i < config.autoPauseThreshold; i++) {
        await rollback.recordFailure(
          `pos-${i}`,
          `0xhash${i}`,
          'tx_reverted',
          `error ${i}`,
        );
      }

      expect(rollback.isPaused()).toBe(true);
    });

    it('resumes after manual resume', async () => {
      for (let i = 0; i < config.autoPauseThreshold; i++) {
        await rollback.recordFailure(`pos-${i}`, `0xhash${i}`, 'tx_reverted', `error ${i}`);
      }

      rollback.resume();
      expect(rollback.isPaused()).toBe(false);
    });
  });
});
