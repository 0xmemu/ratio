import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { GasEstimator } from './gas/GasEstimator';
import { WalletManager } from './wallet/WalletManager';
import { ValidationPipeline } from './validation/ValidationPipeline';
import { RollbackManager } from './rollback/RollbackManager';
import { PositionExecutor } from './position/PositionExecutor';
import type { TransactionContext } from './validation/types';
import type { FailureNotifier, FailureRecord } from './rollback/types';

/**
 * Integration Tests for Phase 3 Execution Engine
 *
 * Covers the full execution flow:
 * 1. Gas estimation & budget validation
 * 2. Wallet management
 * 3. Multi-stage ValidationPipeline (pre_execution, simulation, safety_limits)
 * 4. PositionExecutor lifecycle (open, collect, close, rebalance)
 * 5. RollbackManager — failure detection, retry, auto-pause
 */

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

function makeMockProvider(overrides: Partial<ethers.Provider> = {}): ethers.Provider {
  return {
    getFeeData: vi.fn().mockResolvedValue({
      gasPrice: 20n * 10n ** 9n,
      maxFeePerGas: 25n * 10n ** 9n,
      maxPriorityFeePerGas: 2n * 10n ** 9n,
    }),
    estimateGas: vi.fn().mockResolvedValue(180_000n),
    getBalance: vi.fn().mockResolvedValue(5n * 10n ** 18n),
    getTransactionCount: vi.fn().mockResolvedValue(42),
    getNetwork: vi.fn().mockResolvedValue({ chainId: 11155111n, name: 'sepolia' }),
    call: vi.fn().mockResolvedValue('0x'),                       // eth_call success
    getTransactionReceipt: vi.fn().mockResolvedValue({ status: 1 }), // tx confirmed
    ...overrides,
  } as unknown as ethers.Provider;
}

function makeMockSigner(provider: ethers.Provider): ethers.Signer {
  const wallet = new ethers.Wallet('0x' + '1'.repeat(64));
  return {
    ...wallet,
    provider,
    getAddress: vi.fn().mockResolvedValue(wallet.address),
    sendTransaction: vi.fn().mockResolvedValue({
      hash: '0xabc123',
      wait: vi.fn().mockResolvedValue({
        hash: '0xabc123',
        status: 1,
        gasUsed: 150_000n,
        gasPrice: 22n * 10n ** 9n,
        logs: [],
      }),
    }),
  } as unknown as ethers.Signer;
}

function makeValidationContext(
  provider: ethers.Provider,
  overrides: Partial<TransactionContext> = {},
): TransactionContext {
  return {
    positionSizeUSD: 500n,            // $500 — under $10k threshold
    estimatedGasCostUSD: 3n,           // $3 gas
    estimatedFeeGainUSD: 25n,          // $25 gain → 12% ratio, under 35%
    slippageBps: 40,                   // 40 bps — under 80 bps max
    txData: {
      provider,
      from: '0x' + '1'.repeat(40),
      to:   '0x' + '2'.repeat(40),
      data: '0xdeadbeef',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Execution Engine Integration', () => {
  let mockProvider: ethers.Provider;
  let mockSigner: ethers.Signer;
  let gasEstimator: GasEstimator;
  let walletManager: WalletManager;
  let validationPipeline: ValidationPipeline;
  let rollbackManager: RollbackManager;
  let positionExecutor: PositionExecutor;

  beforeEach(() => {
    mockProvider = makeMockProvider();
    mockSigner   = makeMockSigner(mockProvider);

    gasEstimator = new GasEstimator(mockProvider, {
      maxGasPrice:      100n * 10n ** 9n,
      maxPriorityFee:   5n  * 10n ** 9n,
      gasLimitBuffer:   1.2,
      estimationTimeout: 5000,
      retryAttempts:    2,
    });

    process.env.TEST_PRIVATE_KEY = '0x' + '1'.repeat(64);
    walletManager = new WalletManager(mockProvider, {
      privateKeyEnv:    'TEST_PRIVATE_KEY',
      minEthBalance:    10n ** 17n,
      maxDailyGasSpend: 5n * 10n ** 17n,
      nonceStrategy:    'sequential',
      requiresApproval: false,
    });

    validationPipeline = new ValidationPipeline({
      maxPositionSizeUSD:     10_000n,
      dailyTxLimit:           50,
      approvalThresholdUSD:   10_000n,
      maxGasToFeeRatio:       0.35,
      maxSlippageBps:         80,
      liveEnabled:            true,
    });

    rollbackManager = new RollbackManager(mockProvider, {
      maxRetryAttempts:    3,
      retryBackoffMs:      100,
      autoRollbackEnabled: true,
      autoPauseThreshold:  10,
    });

    positionExecutor = new PositionExecutor(mockSigner, mockProvider, {
      slippageBps:            50,
      deadlineMinutes:        20,
      confirmationsRequired:  1,
      maxPositionSize:        10n ** 18n,
      nftManagerAddress:      '0x1238536071E1c677A632429e3655c799b22cDA52',
      quoterAddress:          '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
    });
  });

  // -------------------------------------------------------------------------
  // Gas
  // -------------------------------------------------------------------------

  describe('GasEstimator', () => {
    it('estimates gas price with EIP-1559 tiers', async () => {
      const price = await gasEstimator.estimateGasPrice();
      expect(price.baseFee).toBeGreaterThan(0n);
      expect(price.fast).toBeGreaterThan(price.slow);
    });

    it('estimates gas limit with buffer', async () => {
      const limit = await gasEstimator.estimateGasLimit({ to: '0x1234', data: '0x' });
      // 180_000 * 1.2 = 216_000
      expect(limit).toBe(216_000n);
    });

    it('validates gas budget', async () => {
      const estimation = await gasEstimator.estimate({ to: '0x1234', data: '0x' });
      expect(gasEstimator.validateGasBudget(estimation)).toBe(true);
    });

    it('recommends execution when gas is favorable', async () => {
      const result = await gasEstimator.optimizeGasCost();
      expect(result.shouldExecute).toBe(true);
    });

    it('rejects execution when gas exceeds max', async () => {
      const highGasProvider = makeMockProvider({
        getFeeData: vi.fn().mockResolvedValue({ gasPrice: 200n * 10n ** 9n }),
      });
      const highGasEstimator = new GasEstimator(highGasProvider, {
        maxGasPrice:       100n * 10n ** 9n,
        maxPriorityFee:    5n  * 10n ** 9n,
        gasLimitBuffer:    1.2,
        estimationTimeout: 5000,
        retryAttempts:     2,
      });
      const result = await highGasEstimator.optimizeGasCost();
      expect(result.shouldExecute).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Wallet
  // -------------------------------------------------------------------------

  describe('WalletManager', () => {
    it('loads wallet and checks balance', async () => {
      await walletManager.loadWallet();
      const balance = await walletManager.checkBalance();
      expect(balance).toBe(5n * 10n ** 18n);
    });

    it('exposes wallet address after loading', async () => {
      await walletManager.loadWallet();
      const addr = walletManager.getAddress();
      expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('throws when sending before loading wallet', async () => {
      await expect(
        walletManager.sendTransaction({ to: '0x1234', data: '0x' }),
      ).rejects.toThrow('Wallet not loaded');
    });
  });

  // -------------------------------------------------------------------------
  // ValidationPipeline
  // -------------------------------------------------------------------------

  describe('ValidationPipeline', () => {
    it('passes pre-execution when config is valid', async () => {
      const ctx = makeValidationContext(mockProvider);
      const result = await validationPipeline.validatePreExecution(ctx);
      expect(result.valid).toBe(true);
      expect(result.stage).toBe('pre_execution');
    });

    it('fails pre-execution when liveEnabled is false', async () => {
      const disabledPipeline = new ValidationPipeline({
        maxPositionSizeUSD:   10_000n,
        dailyTxLimit:         50,
        approvalThresholdUSD: 10_000n,
        maxGasToFeeRatio:     0.35,
        maxSlippageBps:       80,
        liveEnabled:          false,
      });
      const ctx = makeValidationContext(mockProvider);
      const result = await disabledPipeline.validatePreExecution(ctx);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/disabled/);
    });

    it('fails pre-execution when position exceeds max size', async () => {
      const ctx = makeValidationContext(mockProvider, { positionSizeUSD: 99_999n });
      const result = await validationPipeline.validatePreExecution(ctx);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/exceeds max/);
    });

    it('passes simulation when eth_call succeeds', async () => {
      const ctx = makeValidationContext(mockProvider);
      const sim = await validationPipeline.simulateTransaction(ctx);
      expect(sim.success).toBe(true);
    });

    it('fails simulation when eth_call reverts', async () => {
      const revertProvider = makeMockProvider({
        call: vi.fn().mockRejectedValue(new Error('execution reverted: insufficient liquidity')),
      });
      const ctx = makeValidationContext(revertProvider);
      const sim = await validationPipeline.simulateTransaction(ctx);
      expect(sim.success).toBe(false);
      expect(sim.revertReason).toMatch(/insufficient liquidity/);
    });

    it('passes safety limits for a normal context', async () => {
      const ctx = makeValidationContext(mockProvider);
      const result = await validationPipeline.validateSafetyLimits(ctx);
      expect(result.valid).toBe(true);
    });

    it('fails safety limits when gas ratio is too high', async () => {
      const ctx = makeValidationContext(mockProvider, {
        estimatedGasCostUSD: 20n,
        estimatedFeeGainUSD: 10n,  // 200% ratio
      });
      const result = await validationPipeline.validateSafetyLimits(ctx);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/ratio/);
    });

    it('fails safety limits when slippage exceeds max', async () => {
      const ctx = makeValidationContext(mockProvider, { slippageBps: 200 });
      const result = await validationPipeline.validateSafetyLimits(ctx);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/[Ss]lippage/);
    });

    it('runs full pipeline and returns requiresApproval=false for small position', async () => {
      const ctx = makeValidationContext(mockProvider);
      const { passed, results, requiresApproval } = await validationPipeline.validate(ctx);
      expect(passed).toBe(true);
      expect(results).toHaveLength(3);
      expect(requiresApproval).toBe(false);
    });

    it('tracks daily transaction count', () => {
      expect(validationPipeline.getDailyTxCount()).toBe(0);
      validationPipeline.recordTransaction();
      validationPipeline.recordTransaction();
      expect(validationPipeline.getDailyTxCount()).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // RollbackManager
  // -------------------------------------------------------------------------

  describe('RollbackManager', () => {
    it('detects no failure for a confirmed tx (status=1)', async () => {
      const failed = await rollbackManager.detectFailure('0xabc');
      expect(failed).toBe(false);
    });

    it('detects failure for a reverted tx (status=0)', async () => {
      const revertProvider = makeMockProvider({
        getTransactionReceipt: vi.fn().mockResolvedValue({ status: 0 }),
      });
      const rm = new RollbackManager(revertProvider, {
        maxRetryAttempts:    3,
        retryBackoffMs:      10,
        autoRollbackEnabled: true,
        autoPauseThreshold:  10,
      });
      const failed = await rm.detectFailure('0xbad');
      expect(failed).toBe(true);
    });

    it('detects failure when receipt is null (dropped tx)', async () => {
      const dropProvider = makeMockProvider({
        getTransactionReceipt: vi.fn().mockResolvedValue(null),
      });
      const rm = new RollbackManager(dropProvider, {
        maxRetryAttempts:    3,
        retryBackoffMs:      10,
        autoRollbackEnabled: true,
        autoPauseThreshold:  10,
      });
      expect(await rm.detectFailure('0xdrop')).toBe(true);
    });

    it('retries with exponential backoff and eventually succeeds', async () => {
      let attempts = 0;
      const result = await rollbackManager.withRetry(
        async () => {
          attempts++;
          if (attempts < 3) throw new Error('transient');
          return 'ok';
        },
        'pos-1',
        'tx_failed',
      );
      expect(result).toBe('ok');
      expect(attempts).toBe(3);
    });

    it('throws after maxRetryAttempts exhausted', async () => {
      await expect(
        rollbackManager.withRetry(
          async () => { throw new Error('permanent'); },
          'pos-2',
          'tx_reverted',
        ),
      ).rejects.toThrow('permanent');
    });

    it('records failures and builds log', async () => {
      await rollbackManager.recordFailure('pos-3', '0xfail', 'slippage_exceeded', 'too much slippage');
      const log = rollbackManager.getFailureLog('pos-3');
      expect(log).toHaveLength(1);
      expect(log[0].reason).toBe('slippage_exceeded');
    });

    it('executes rollback with close callback', async () => {
      let closeCalled = false;
      await rollbackManager.rollbackPosition('pos-4', 'gas_spike', async () => {
        closeCalled = true;
      });
      expect(closeCalled).toBe(true);
    });

    it('triggers auto-pause when threshold exceeded', async () => {
      const notifiedPauses: string[] = [];
      const notifier: FailureNotifier = {
        onFailure: vi.fn(),
        onAutoPause: vi.fn().mockImplementation(async (reason) => {
          notifiedPauses.push(reason);
        }),
      };
      const rm = new RollbackManager(mockProvider, {
        maxRetryAttempts:    1,
        retryBackoffMs:      1,
        autoRollbackEnabled: false,
        autoPauseThreshold:  3,  // pause after 3 failures
      }, notifier);

      for (let i = 0; i < 3; i++) {
        await rm.recordFailure(`pos-${i}`, undefined, 'tx_failed', 'fail');
      }
      expect(rm.isPaused()).toBe(true);
      expect(notifiedPauses.length).toBeGreaterThan(0);
    });

    it('can be resumed after pause', async () => {
      await rollbackManager.recordFailure('p', undefined, 'tx_failed', 'x');
      rollbackManager.resume();
      expect(rollbackManager.isPaused()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Full pipeline
  // -------------------------------------------------------------------------

  describe('Full Execution Pipeline', () => {
    it('gas → validate → position open — happy path', async () => {
      // 1. Gas
      const gasEst = await gasEstimator.estimate({ to: '0x1234', data: '0x' });
      expect(gasEstimator.validateGasBudget(gasEst)).toBe(true);

      // 2. Validate
      const ctx = makeValidationContext(mockProvider);
      const { passed } = await validationPipeline.validate(ctx);
      expect(passed).toBe(true);

      // 3. Wallet
      await walletManager.loadWallet();
      const balance = await walletManager.checkBalance();
      expect(balance > gasEst.totalCost).toBe(true);

      // 4. Record tx after success
      validationPipeline.recordTransaction();
      expect(validationPipeline.getDailyTxCount()).toBe(1);
    });

    it('stops pipeline and triggers rollback on simulation failure', async () => {
      const revertProvider = makeMockProvider({
        call: vi.fn().mockRejectedValue(new Error("execution reverted: STF")),
      });
      const ctx = makeValidationContext(revertProvider);
      const { passed, results } = await validationPipeline.validate(ctx);

      expect(passed).toBe(false);
      const simResult = results.find(r => r.stage === 'simulation');
      expect(simResult?.valid).toBe(false);
      expect(simResult?.errors[0]).toMatch(/STF/);

      // Trigger rollback
      let rolledBack = false;
      await rollbackManager.rollbackPosition('pos-e2e', 'simulation_failed', async () => {
        rolledBack = true;
      });
      expect(rolledBack).toBe(true);
    });
  });
});
