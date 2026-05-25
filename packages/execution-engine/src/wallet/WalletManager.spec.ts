import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { WalletManager } from './WalletManager';
import type { WalletConfig } from './types';

describe('WalletManager', () => {
  let walletManager: WalletManager;
  let mockProvider: ethers.Provider;
  let config: WalletConfig;

  beforeEach(() => {
    mockProvider = {
      getBalance: vi.fn(),
      getTransactionCount: vi.fn(),
    } as unknown as ethers.Provider;

    config = {
      privateKeyEnv: 'TEST_PRIVATE_KEY',
      minBalance: 10n ** 17n, // 0.1 ETH
    };

    process.env.TEST_PRIVATE_KEY = '0x' + '1'.repeat(64);
    walletManager = new WalletManager(mockProvider, config);
  });

  describe('loadWallet', () => {
    it('should load wallet from environment variable', async () => {
      await walletManager.loadWallet();
      expect(walletManager['wallet']).toBeDefined();
    });

    it('should throw error when private key is missing', async () => {
      delete process.env.TEST_PRIVATE_KEY;
      const manager = new WalletManager(mockProvider, config);
      await expect(manager.loadWallet()).rejects.toThrow('Private key not found');
    });
  });

  describe('checkBalance', () => {
    it('should return wallet balance', async () => {
      await walletManager.loadWallet();
      const mockBalance = 10n ** 18n; // 1 ETH
      vi.spyOn(mockProvider, 'getBalance').mockResolvedValue(mockBalance);

      const balance = await walletManager.checkBalance();
      expect(balance).toBe(mockBalance);
    });

    it('should throw error when wallet not loaded', async () => {
      await expect(walletManager.checkBalance()).rejects.toThrow('Wallet not loaded');
    });
  });

  describe('sendTransaction', () => {
    it('should send transaction successfully', async () => {
      await walletManager.loadWallet();
      const mockTx = {
        to: '0x1234567890123456789012345678901234567890',
        data: '0x',
        value: 0n,
      };

      const mockResponse = {
        hash: '0xabcdef',
        wait: vi.fn().mockResolvedValue({ status: 1 }),
      };

      vi.spyOn(walletManager['wallet']!, 'sendTransaction').mockResolvedValue(mockResponse as any);

      const result = await walletManager.sendTransaction(mockTx);
      expect(result.hash).toBe('0xabcdef');
    });

    it('should throw error when wallet not loaded', async () => {
      const tx = { to: '0x0', data: '0x', value: 0n };
      await expect(walletManager.sendTransaction(tx)).rejects.toThrow('Wallet not loaded');
    });
  });
});
