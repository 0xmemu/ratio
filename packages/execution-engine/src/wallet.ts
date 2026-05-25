import { ethers } from 'ethers';

export interface WalletManagerConfig {
  rpcUrl: string;
  privateKeyEnv?: string;
  minimumBalanceEth?: number;
}

export interface WalletBalance {
  address: string;
  balanceWei: bigint;
  balanceEth: string;
  sufficient: boolean;
}

export class WalletManager {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private minimumBalanceEth: number;

  constructor(config: WalletManagerConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);

    const envKey = config.privateKeyEnv ?? 'WALLET_PRIVATE_KEY';
    const privateKey = process.env[envKey];

    if (!privateKey) {
      throw new Error(`[wallet-manager] missing env var: ${envKey}`);
    }

    this.signer = new ethers.Wallet(privateKey, this.provider);
    this.minimumBalanceEth = config.minimumBalanceEth ?? 0.05;
  }

  getAddress(): string {
    return this.signer.address;
  }

  getSigner(): ethers.Wallet {
    return this.signer;
  }

  async getBalance(): Promise<WalletBalance> {
    const balanceWei = await this.provider.getBalance(this.signer.address);
    const balanceEth = ethers.formatEther(balanceWei);

    return {
      address: this.signer.address,
      balanceWei,
      balanceEth,
      sufficient: Number(balanceEth) >= this.minimumBalanceEth,
    };
  }

  async getNonce(): Promise<number> {
    return this.provider.getTransactionCount(this.signer.address, 'latest');
  }

  async signMessage(message: string): Promise<string> {
    return this.signer.signMessage(message);
  }

  async sendTransaction(tx: ethers.TransactionRequest) {
    return this.signer.sendTransaction(tx);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.provider.getBlockNumber();
      const balance = await this.getBalance();
      return balance.sufficient;
    } catch {
      return false;
    }
  }
}

export default WalletManager;
