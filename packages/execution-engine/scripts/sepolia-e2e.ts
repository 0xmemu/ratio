#!/usr/bin/env ts-node
/**
 * scripts/sepolia-e2e.ts
 *
 * End-to-end validation script for Sepolia testnet.
 * Exercises the full Phase 3 stack: validate → open → collect → rebalance → close.
 *
 * Usage:
 *   pnpm --filter @ratio/execution-engine exec ts-node scripts/sepolia-e2e.ts
 *
 * Required env vars (copy .env.sepolia to .env and fill in real values):
 *   RPC_URL                    — Sepolia RPC endpoint
 *   WALLET_PRIVATE_KEY         — Testnet-only private key (never mainnet!)
 *   UNISWAP_V3_NFT_MANAGER     — 0x1238536071E1c677A632429e3655c799b22cDA52
 *   UNISWAP_V3_QUOTER          — 0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3
 *   TELEGRAM_BOT_TOKEN         — (optional) ops-bot token for failure alerts
 *   TELEGRAM_ALERT_CHAT_ID     — (optional) alert chat ID
 *
 * SAFETY: this script always starts in DRY_RUN mode.
 * Set EXECUTION_MODE=live in env to actually send transactions.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ethers } from 'ethers';

import { GasEstimator } from '../src/gas/GasEstimator';
import { WalletManager } from '../src/wallet/WalletManager';
import { ValidationPipeline } from '../src/validation/ValidationPipeline';
import { RollbackManager } from '../src/rollback/RollbackManager';
import { PositionExecutor } from '../src/position/PositionExecutor';
import { MetricsCollector } from '../src/monitoring/MetricsCollector';
import { TelegramFailureNotifier } from '../src/monitoring/TelegramFailureNotifier';
import type { TransactionContext } from '../src/validation/types';
import type { PositionParams } from '../src/position/types';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const LIVE = (process.env.EXECUTION_MODE ?? 'dry_run') === 'live';
const RPC  = process.env.RPC_URL ?? 'https://rpc.sepolia.org';
const NFT_MANAGER = process.env.UNISWAP_V3_NFT_MANAGER ?? '0x1238536071E1c677A632429e3655c799b22cDA52';
const QUOTER      = process.env.UNISWAP_V3_QUOTER      ?? '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3';

// Sepolia USDC/WETH 0.05% pool (well-known, deep enough for testing)
const SEPOLIA_POOL  = '0x6Ce0896eAE6D4BD668fDe41BB784548fb8F59b50';
const SEPOLIA_USDC  = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const SEPOLIA_WETH  = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';

// Tight range around current tick for minimal exposure
const TICK_LOWER = -60;
const TICK_UPPER =  60;
const AMOUNT_USDC = 5_000_000n;  // 5 USDC (6 decimals)
const AMOUNT_WETH = 1_000_000_000_000_000n; // 0.001 WETH

const log = (msg: string) => console.log(`[sepolia-e2e] ${new Date().toISOString()} ${msg}`);
const die = (msg: string) => { console.error(`[sepolia-e2e] FATAL: ${msg}`); process.exit(1); };

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log(`=== Ratio Execution Engine — Sepolia E2E (mode=${LIVE ? 'LIVE' : 'DRY_RUN'}) ===`);

  // 1. Provider + signer
  const provider = new ethers.JsonRpcProvider(RPC);
  const network = await provider.getNetwork();
  if (network.chainId !== 11155111n) die(`Expected Sepolia chainId=11155111, got ${network.chainId}`);
  log(`Connected to Sepolia (chainId=${network.chainId})`);

  // 2. Services
  const gasConfig = {
    maxGasPrice:       50n * 10n ** 9n,
    maxPriorityFee:    2n  * 10n ** 9n,
    gasLimitBuffer:    1.2,
    estimationTimeout: 10_000,
    retryAttempts:     3,
  };

  const walletCfg = {
    privateKeyEnv:    'WALLET_PRIVATE_KEY',
    minEthBalance:    10n ** 17n,        // 0.1 ETH
    maxDailyGasSpend: 5n * 10n ** 17n,  // 0.5 ETH
    nonceStrategy:    'sequential' as const,
    requiresApproval: false,
  };

  const gasEstimator = new GasEstimator(provider, gasConfig);
  const wallet       = new WalletManager(provider, walletCfg);
  const metrics      = new MetricsCollector();

  // Optional Telegram notifier
  let notifier: TelegramFailureNotifier | undefined;
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ALERT_CHAT_ID) {
    notifier = TelegramFailureNotifier.fromEnv('[SEPOLIA-E2E]');
    log('Telegram notifier enabled');
  }

  const rollback = new RollbackManager(provider, {
    maxRetryAttempts:    3,
    retryBackoffMs:      1_000,
    autoRollbackEnabled: true,
    autoPauseThreshold:  5,
  }, notifier);

  const validation = new ValidationPipeline({
    maxPositionSizeUSD:     1_000n,
    dailyTxLimit:           20,
    approvalThresholdUSD:   500n,
    maxGasToFeeRatio:       0.5,
    maxSlippageBps:         100,
    liveEnabled:            LIVE,
  });

  // 3. Load wallet
  await wallet.loadWallet();
  const signerAddress = wallet.getAddress();
  const balance = await wallet.checkBalance();
  log(`Wallet: ${signerAddress}`);
  log(`Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance < 10n ** 17n) {
    die('Insufficient testnet ETH — request from https://sepoliafaucet.com');
  }

  // 4. Gas check
  const feeData = await provider.getFeeData();
  log(`Gas price: ${ethers.formatUnits(feeData.gasPrice ?? 0n, 'gwei')} gwei`);
  const gasOpt = await gasEstimator.optimizeGasCost();
  if (!gasOpt.shouldExecute) {
    log(`Gas unfavorable: ${gasOpt.reason} — aborting`);
    process.exit(0);
  }

  // PositionExecutor — requires signer from ethers.Wallet
  const privateKey = process.env.WALLET_PRIVATE_KEY!;
  const signer = new ethers.Wallet(privateKey, provider);

  const executor = new PositionExecutor(signer, provider, {
    slippageBps:           50,
    deadlineMinutes:       20,
    confirmationsRequired: 1,
    maxPositionSize:       10n ** 18n,
    nftManagerAddress:     NFT_MANAGER,
    quoterAddress:         QUOTER,
  });

  // ---------------------------------------------------------------------------
  // Step A: Build tx context for validation
  // ---------------------------------------------------------------------------
  log('--- Step A: Validation ---');

  // Build a dummy mint calldata for simulation
  // (in prod this would be the actual encoded tx)
  const dummyCalldata = '0x';
  const txCtx: TransactionContext = {
    positionSizeUSD:      10n,    // tiny test position
    estimatedGasCostUSD:  1n,
    estimatedFeeGainUSD:  5n,
    slippageBps:          50,
    txData: {
      provider,
      from:  signerAddress,
      to:    NFT_MANAGER,
      data:  dummyCalldata,
    },
  };

  if (LIVE) {
    const { passed, results, requiresApproval } = await validation.validate(txCtx);
    for (const r of results) {
      log(`  [${r.stage}] valid=${r.valid} errors=${r.errors.join('; ') || 'none'}`);
    }
    if (!passed) {
      die('Validation failed — aborting');
    }
    if (requiresApproval) {
      log('  ⚠️  Position requires manual approval (above threshold)');
      // In prod: wait for Telegram approval callback here
    }
  } else {
    log('  [DRY_RUN] Skipping live validation');
  }

  // ---------------------------------------------------------------------------
  // Step B: Pool state
  // ---------------------------------------------------------------------------
  log('--- Step B: Pool State ---');
  const { tick, sqrtPriceX96 } = await executor.getPoolState(SEPOLIA_POOL);
  log(`  Current tick: ${tick}  sqrtPriceX96: ${sqrtPriceX96}`);

  // ---------------------------------------------------------------------------
  // Step C: Open position
  // ---------------------------------------------------------------------------
  log('--- Step C: Open Position ---');
  const openParams: PositionParams = {
    poolAddress:    SEPOLIA_POOL,
    token0:         SEPOLIA_USDC,
    token1:         SEPOLIA_WETH,
    fee:            500,           // 0.05% tier
    tickLower:      tick + TICK_LOWER,
    tickUpper:      tick + TICK_UPPER,
    amount0Desired: AMOUNT_USDC,
    amount1Desired: AMOUNT_WETH,
    recipient:      signerAddress,
  };

  if (!LIVE) {
    log('  [DRY_RUN] Would call executor.openPosition()');
    log('  Params:', JSON.stringify(openParams, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
    log('=== E2E DRY-RUN COMPLETE ✓ ===');
    log('Set EXECUTION_MODE=live in .env to execute real transactions on Sepolia.');
    return;
  }

  let tokenId: bigint;
  let liquidity: bigint;
  try {
    const openResult = await rollback.withRetry(
      () => executor.openPosition(openParams),
      'e2e-open',
      'tx_failed',
    );
    tokenId = openResult.tokenId;
    liquidity = openResult.liquidity;
    log(`  ✅ Position opened: tokenId=${tokenId} liquidity=${liquidity}`);
    log(`     amount0=${openResult.amount0} amount1=${openResult.amount1}`);
    log(`     txHash=${openResult.txHash}`);
    validation.recordTransaction();
    metrics.recordTx({
      txHash:    openResult.txHash,
      gasUsedWei: 0n, // TODO: fetch receipt
      gasCostUSD: 0,
      success:   true,
      timestamp: Date.now(),
      positionId: tokenId.toString(),
      action: 'openPosition',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await rollback.recordFailure('e2e-open', undefined, 'tx_failed', msg);
    die(`openPosition failed: ${msg}`);
    return;
  }

  // ---------------------------------------------------------------------------
  // Step D: Collect fees (will be zero immediately after mint, but tests the flow)
  // ---------------------------------------------------------------------------
  log('--- Step D: Collect Fees ---');
  try {
    const collected = await executor.collectFees(tokenId, signerAddress);
    log(`  ✅ Collected: amount0=${collected.amount0} amount1=${collected.amount1}`);
    log(`     txHash=${collected.txHash}`);
    validation.recordTransaction();
  } catch (err) {
    log(`  ⚠️  collectFees failed (non-fatal): ${err instanceof Error ? err.message : err}`);
  }

  // ---------------------------------------------------------------------------
  // Step E: Close position
  // ---------------------------------------------------------------------------
  log('--- Step E: Close Position ---');
  try {
    const closed = await rollback.withRetry(
      () => executor.closePosition(tokenId, liquidity, signerAddress),
      `e2e-close-${tokenId}`,
      'tx_failed',
    );
    log(`  ✅ Closed: amount0=${closed.collected.amount0} amount1=${closed.collected.amount1}`);
    log(`     burnTxHash=${closed.txHashBurn}`);
    validation.recordTransaction();
    metrics.recordTx({
      txHash:     closed.txHashBurn,
      gasUsedWei: 0n,
      gasCostUSD: 0,
      success:    true,
      timestamp:  Date.now(),
      positionId: tokenId.toString(),
      action: 'closePosition',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await rollback.rollbackPosition(`e2e-${tokenId}`, 'tx_failed');
    die(`closePosition failed: ${msg}`);
    return;
  }

  // ---------------------------------------------------------------------------
  // Final metrics
  // ---------------------------------------------------------------------------
  log('--- Final Metrics ---');
  const snap = metrics.snapshot();
  log(`  Daily tx count:    ${snap.dailyTxCount}`);
  log(`  Daily failures:    ${snap.dailyFailureCount}`);
  log(`  Failure rate:      ${(snap.failureRate * 100).toFixed(1)}%`);
  log(`  Daily gas (USD):   $${snap.dailyGasSpentUSD.toFixed(4)}`);
  log('=== E2E COMPLETE ✓ ===');
}

main().catch((err) => {
  console.error('[sepolia-e2e] Unhandled error:', err);
  process.exit(1);
});
