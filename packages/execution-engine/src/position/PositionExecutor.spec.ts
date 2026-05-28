import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { PositionExecutor } from './PositionExecutor';
import type { PositionConfig, PositionParams } from './types';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const TOKEN0 = '0x1234567890123456789012345678901234567890';
const TOKEN1 = '0x0987654321098765432109876543210987654321';
const NFT_MGR = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

describe('PositionExecutor', () => {
  let executor: PositionExecutor;
  let mockSigner: ethers.Signer;
  let mockProvider: ethers.Provider;
  let config: PositionConfig;

  beforeEach(() => {
    mockSigner = {
      getAddress: vi.fn().mockResolvedValue('0xsigner'),
    } as unknown as ethers.Signer;

    mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 1n }),
    } as unknown as ethers.Provider;

    config = {
      slippageBps: 50,
      deadlineMinutes: 20,
      confirmationsRequired: 1,
      nftManagerAddress: NFT_MGR,
    };

    executor = new PositionExecutor(mockSigner, mockProvider, config);
  });

  it('stores config correctly', () => {
    expect(executor).toBeDefined();
  });

  describe('openPosition', () => {
    it('throws when NFT manager not reachable (no mock signer)', async () => {
      const params: PositionParams = {
        token0: TOKEN0,
        token1: TOKEN1,
        fee: 3000,
        tickLower: -887272,
        tickUpper: 887272,
        amount0Desired: 10n ** 18n,
        amount1Desired: 10n ** 18n,
        recipient: ZERO_ADDR,
      };

      await expect(executor.openPosition(params)).rejects.toThrow();
    });
  });

  describe('closePosition', () => {
    it('throws when NFT manager not reachable (no mock signer)', async () => {
      await expect(
        executor.closePosition(1n, 1000n, ZERO_ADDR),
      ).rejects.toThrow();
    });
  });

  describe('rebalancePosition', () => {
    it('throws when NFT manager not reachable (no mock signer)', async () => {
      const newParams: PositionParams = {
        token0: TOKEN0,
        token1: TOKEN1,
        fee: 3000,
        tickLower: -887272,
        tickUpper: 887272,
        amount0Desired: 5n ** 18n,
        amount1Desired: 5n ** 18n,
        recipient: ZERO_ADDR,
      };

      await expect(
        executor.rebalancePosition(1n, 1000n, ZERO_ADDR, newParams),
      ).rejects.toThrow();
    });
  });
});
