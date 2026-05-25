import { ethers } from 'ethers';
import type { PositionConfig, PositionParams, PositionResult, CollectResult, DecreaseResult } from './types';
import {
  ERC20_ABI,
  UNISWAP_V3_NFT_MANAGER_ABI,
  UNISWAP_V3_POOL_ABI,
} from '../contracts/abis';

const UINT128_MAX = (2n ** 128n) - 1n;

/**
 * PositionExecutor — Phase 3 Milestone 3
 *
 * Full Uniswap v3 position lifecycle:
 * - approve token allowances
 * - mint new position (open)
 * - collect fees
 * - decrease liquidity + collect (partial or full close)
 * - burn NFT (full close cleanup)
 * - rebalance = close + open
 */
export class PositionExecutor {
  private config: PositionConfig;
  private provider: ethers.Provider;
  private signer: ethers.Signer;

  constructor(signer: ethers.Signer, provider: ethers.Provider, config: PositionConfig) {
    this.signer = signer;
    this.provider = provider;
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private deadline(): number {
    return Math.floor(Date.now() / 1000) + this.config.deadlineMinutes * 60;
  }

  private slipMin(amount: bigint): bigint {
    return (amount * BigInt(10_000 - this.config.slippageBps)) / 10_000n;
  }

  private nftManager(): ethers.Contract {
    return new ethers.Contract(
      this.config.nftManagerAddress,
      UNISWAP_V3_NFT_MANAGER_ABI,
      this.signer,
    );
  }

  private erc20(address: string): ethers.Contract {
    return new ethers.Contract(address, ERC20_ABI, this.signer);
  }

  private poolContract(address: string): ethers.Contract {
    return new ethers.Contract(address, UNISWAP_V3_POOL_ABI, this.provider);
  }

  private async waitConfirmed(tx: ethers.TransactionResponse): Promise<ethers.TransactionReceipt> {
    const receipt = await tx.wait(this.config.confirmationsRequired);
    if (!receipt) throw new Error(`Transaction ${tx.hash} returned null receipt`);
    if (receipt.status === 0) throw new Error(`Transaction ${tx.hash} reverted on-chain`);
    return receipt;
  }

  // ---------------------------------------------------------------------------
  // Token approval
  // ---------------------------------------------------------------------------

  async ensureApproval(tokenAddress: string, amount: bigint): Promise<void> {
    const signerAddress = await this.signer.getAddress();
    const token = this.erc20(tokenAddress);
    const allowance: bigint = await token.allowance(signerAddress, this.config.nftManagerAddress);
    if (allowance < amount) {
      const tx: ethers.TransactionResponse = await token.approve(
        this.config.nftManagerAddress,
        UINT128_MAX, // max approval to avoid repeated approvals
      );
      await this.waitConfirmed(tx);
    }
  }

  // ---------------------------------------------------------------------------
  // Open position (mint)
  // ---------------------------------------------------------------------------

  async openPosition(params: PositionParams): Promise<PositionResult> {
    // Ensure both tokens approved
    await this.ensureApproval(params.token0, params.amount0Desired);
    await this.ensureApproval(params.token1, params.amount1Desired);

    const mgr = this.nftManager();
    const mintParams = {
      token0: params.token0,
      token1: params.token1,
      fee: params.fee,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      amount0Desired: params.amount0Desired,
      amount1Desired: params.amount1Desired,
      amount0Min: this.slipMin(params.amount0Desired),
      amount1Min: this.slipMin(params.amount1Desired),
      recipient: params.recipient,
      deadline: this.deadline(),
    };

    const tx: ethers.TransactionResponse = await mgr.mint(mintParams);
    const receipt = await this.waitConfirmed(tx);

    // Parse TokenId from Transfer event (ERC721)
    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const transferLog = receipt.logs.find((l) => l.topics[0] === transferTopic);
    if (!transferLog) throw new Error('Could not find Transfer event in mint receipt');
    const tokenId = BigInt(transferLog.topics[3]);

    // Parse amounts from mint return via IncreaseLiquidity event
    const increaseTopic = ethers.id('IncreaseLiquidity(uint256,uint128,uint256,uint256)');
    const increaseLog = receipt.logs.find((l) => l.topics[0] === increaseTopic);
    let liquidity = 0n;
    let amount0 = 0n;
    let amount1 = 0n;
    if (increaseLog) {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ['uint128', 'uint256', 'uint256'],
        increaseLog.data,
      );
      liquidity = decoded[0] as bigint;
      amount0 = decoded[1] as bigint;
      amount1 = decoded[2] as bigint;
    }

    return { tokenId, liquidity, amount0, amount1, txHash: receipt.hash };
  }

  // ---------------------------------------------------------------------------
  // Collect fees
  // ---------------------------------------------------------------------------

  async collectFees(tokenId: bigint, recipient: string): Promise<CollectResult> {
    const mgr = this.nftManager();
    const collectParams = {
      tokenId,
      recipient,
      amount0Max: UINT128_MAX,
      amount1Max: UINT128_MAX,
    };

    const tx: ethers.TransactionResponse = await mgr.collect(collectParams);
    const receipt = await this.waitConfirmed(tx);

    // Parse Collect event
    const collectTopic = ethers.id('Collect(uint256,address,uint256,uint256)');
    const collectLog = receipt.logs.find((l) => l.topics[0] === collectTopic);
    let amount0 = 0n;
    let amount1 = 0n;
    if (collectLog) {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ['uint256', 'uint256'],
        collectLog.data,
      );
      amount0 = decoded[0] as bigint;
      amount1 = decoded[1] as bigint;
    }

    return { amount0, amount1, txHash: receipt.hash };
  }

  // ---------------------------------------------------------------------------
  // Decrease liquidity
  // ---------------------------------------------------------------------------

  async decreaseLiquidity(
    tokenId: bigint,
    liquidity: bigint,
    amount0Min: bigint,
    amount1Min: bigint,
  ): Promise<DecreaseResult> {
    const mgr = this.nftManager();
    const params = {
      tokenId,
      liquidity,
      amount0Min: this.slipMin(amount0Min),
      amount1Min: this.slipMin(amount1Min),
      deadline: this.deadline(),
    };

    const tx: ethers.TransactionResponse = await mgr.decreaseLiquidity(params);
    const receipt = await this.waitConfirmed(tx);

    // Parse DecreaseLiquidity event
    const decreaseTopic = ethers.id('DecreaseLiquidity(uint256,uint128,uint256,uint256)');
    const decreaseLog = receipt.logs.find((l) => l.topics[0] === decreaseTopic);
    let amount0 = 0n;
    let amount1 = 0n;
    if (decreaseLog) {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ['uint128', 'uint256', 'uint256'],
        decreaseLog.data,
      );
      amount0 = decoded[1] as bigint;
      amount1 = decoded[2] as bigint;
    }

    return { amount0, amount1, txHash: receipt.hash };
  }

  // ---------------------------------------------------------------------------
  // Close position (decrease all + collect + burn)
  // ---------------------------------------------------------------------------

  async closePosition(
    tokenId: bigint,
    liquidity: bigint,
    recipient: string,
  ): Promise<{ collected: CollectResult; txHashBurn: string }> {
    // 1. Decrease all liquidity
    await this.decreaseLiquidity(tokenId, liquidity, 0n, 0n);

    // 2. Collect all tokens owed
    const collected = await this.collectFees(tokenId, recipient);

    // 3. Burn the NFT
    const mgr = this.nftManager();
    const burnTx: ethers.TransactionResponse = await mgr.burn(tokenId);
    const burnReceipt = await this.waitConfirmed(burnTx);

    return { collected, txHashBurn: burnReceipt.hash };
  }

  // ---------------------------------------------------------------------------
  // Rebalance (close + open)
  // ---------------------------------------------------------------------------

  async rebalancePosition(
    tokenId: bigint,
    currentLiquidity: bigint,
    recipient: string,
    newParams: PositionParams,
  ): Promise<{ closed: CollectResult; opened: PositionResult }> {
    const { collected: closed } = await this.closePosition(tokenId, currentLiquidity, recipient);
    const opened = await this.openPosition(newParams);
    return { closed, opened };
  }

  // ---------------------------------------------------------------------------
  // Read helpers
  // ---------------------------------------------------------------------------

  /** Get current tick and sqrtPriceX96 from pool */
  async getPoolState(poolAddress: string): Promise<{ tick: number; sqrtPriceX96: bigint }> {
    const pool = this.poolContract(poolAddress);
    const slot0 = await pool.slot0();
    return { tick: Number(slot0[1]), sqrtPriceX96: BigInt(slot0[0]) };
  }
}
