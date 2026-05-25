import { ethers } from 'ethers';
import type { WalletConfig, WalletInfo } from './types';

export class WalletManager {
  private wallet: ethers.Wallet | null = null;
  private config: WalletConfig;
  private provider: ethers.Provider;

  constructor(provider: ethers.Provider, config: WalletConfig) {
    this.provider = provider;
    this.config = config;
  }

  async loadWallet(): Promise<void> {
    const privateKey = process.env[this.config.privateKeyEnv];
    if (!privateKey) throw new Error('Private key not found');
    this.wallet = new ethers.Wallet(privateKey, this.provider);
  }

  async checkBalance(): Promise<bigint> {
    if (!this.wallet) throw new Error('Wallet not loaded');
    return await this.provider.getBalance(this.wallet.address);
  }

  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error('Wallet not loaded');
    return await this.wallet.sendTransaction(tx);
  }

  getAddress(): string {
    if (!this.wallet) throw new Error('Wallet not loaded');
    return this.wallet.address;
  }
}
