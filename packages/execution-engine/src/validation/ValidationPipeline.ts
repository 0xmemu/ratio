import type {
  ValidationResult,
  ValidationConfig,
  TransactionContext,
  SimulationResult,
  DailyTxTracker,
} from './types';

const UINT128_MAX = (2n ** 128n) - 1n;

/**
 * ValidationPipeline — Phase 3 Milestone 2
 *
 * Runs a multi-stage validation gate before any live transaction:
 * 1. Pre-execution: live-enabled flag, daily tx limit, position size cap
 * 2. Simulation: eth_call dry run to catch reverts before sending
 * 3. Safety limits: gas/fee ratio, slippage, approval threshold
 */
export class ValidationPipeline {
  private config: ValidationConfig;
  private dailyTracker: DailyTxTracker = { date: '', count: 0 };

  constructor(config: ValidationConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Stage 1 — Pre-execution checks
  // ---------------------------------------------------------------------------

  async validatePreExecution(ctx?: TransactionContext): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Hard gate: live execution must be explicitly enabled
    if (!this.config.liveEnabled) {
      errors.push('Live execution is disabled (LIVE_ENABLED=false). Set to true to allow real transactions.');
    }

    // Daily transaction limit
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyTracker.date !== today) {
      this.dailyTracker = { date: today, count: 0 };
    }
    if (this.dailyTracker.count >= this.config.dailyTxLimit) {
      errors.push(
        `Daily transaction limit reached: ${this.dailyTracker.count}/${this.config.dailyTxLimit}`,
      );
    }

    // Position size cap
    if (ctx) {
      if (ctx.positionSizeUSD > this.config.maxPositionSizeUSD) {
        errors.push(
          `Position size $${ctx.positionSizeUSD} exceeds max $${this.config.maxPositionSizeUSD}`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      stage: 'pre_execution',
      errors,
      warnings,
      timestamp: Date.now(),
    };
  }

  // ---------------------------------------------------------------------------
  // Stage 2 — eth_call simulation
  // ---------------------------------------------------------------------------

  async simulateTransaction(ctx: TransactionContext): Promise<SimulationResult> {
    try {
      const callParams = {
        from: ctx.txData.from,
        to: ctx.txData.to,
        data: ctx.txData.data,
        value: ctx.txData.value ?? 0n,
      };

      // eth_call: returns returnData or throws with revert reason
      const returnData = await ctx.txData.provider.call(callParams);

      // Try to estimate gas as a secondary check
      let gasUsed: bigint | undefined;
      try {
        gasUsed = await ctx.txData.provider.estimateGas(callParams);
      } catch {
        // Non-fatal — simulation passed, gas estimate is informational
      }

      return { success: true, gasUsed, returnData };
    } catch (err: unknown) {
      const revertReason = this.extractRevertReason(err);
      return { success: false, revertReason };
    }
  }

  private extractRevertReason(err: unknown): string {
    if (err instanceof Error) {
      // ethers v6 wraps revert reasons in the error message
      const match = err.message.match(/reason="([^"]+)"/) ||
                    err.message.match(/reverted with reason string '([^']+)'/) ||
                    err.message.match(/execution reverted: (.+)/);
      if (match) return match[1];
      return err.message;
    }
    return String(err);
  }

  // ---------------------------------------------------------------------------
  // Stage 3 — Safety limits
  // ---------------------------------------------------------------------------

  async validateSafetyLimits(ctx: TransactionContext): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Gas-to-fee ratio: don't spend more than X% of expected gain on gas
    if (ctx.estimatedFeeGainUSD > 0n) {
      const gasFeeRatio = Number(ctx.estimatedGasCostUSD) / Number(ctx.estimatedFeeGainUSD);
      if (gasFeeRatio > this.config.maxGasToFeeRatio) {
        errors.push(
          `Gas cost ratio ${(gasFeeRatio * 100).toFixed(1)}% exceeds max ${(this.config.maxGasToFeeRatio * 100).toFixed(1)}%`,
        );
      } else if (gasFeeRatio > this.config.maxGasToFeeRatio * 0.8) {
        warnings.push(
          `Gas cost ratio ${(gasFeeRatio * 100).toFixed(1)}% approaching limit`,
        );
      }
    } else {
      errors.push('Estimated fee gain is zero — execution not economically viable');
    }

    // Slippage
    if (ctx.slippageBps > this.config.maxSlippageBps) {
      errors.push(
        `Slippage ${ctx.slippageBps}bps exceeds max ${this.config.maxSlippageBps}bps`,
      );
    }

    // Approval threshold warning
    if (ctx.positionSizeUSD >= this.config.approvalThresholdUSD) {
      warnings.push(
        `Position size $${ctx.positionSizeUSD} requires explicit approval (threshold: $${this.config.approvalThresholdUSD})`,
      );
    }

    return {
      valid: errors.length === 0,
      stage: 'safety_limits',
      errors,
      warnings,
      timestamp: Date.now(),
    };
  }

  // ---------------------------------------------------------------------------
  // Full pipeline — run all stages in sequence
  // ---------------------------------------------------------------------------

  async validate(ctx: TransactionContext): Promise<{
    passed: boolean;
    results: ValidationResult[];
    requiresApproval: boolean;
  }> {
    const results: ValidationResult[] = [];

    // Stage 1
    const pre = await this.validatePreExecution(ctx);
    results.push(pre);
    if (!pre.valid) return { passed: false, results, requiresApproval: false };

    // Stage 2 — simulation
    const sim = await this.simulateTransaction(ctx);
    const simResult: ValidationResult = {
      valid: sim.success,
      stage: 'simulation',
      errors: sim.success ? [] : [`Transaction simulation failed: ${sim.revertReason}`],
      warnings: [],
      timestamp: Date.now(),
    };
    results.push(simResult);
    if (!simResult.valid) return { passed: false, results, requiresApproval: false };

    // Stage 3 — safety limits
    const safety = await this.validateSafetyLimits(ctx);
    results.push(safety);
    if (!safety.valid) return { passed: false, results, requiresApproval: false };

    // Determine if approval required
    const requiresApproval = ctx.positionSizeUSD >= this.config.approvalThresholdUSD;

    return { passed: true, results, requiresApproval };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Call after a transaction is confirmed to increment daily counter */
  recordTransaction(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyTracker.date !== today) {
      this.dailyTracker = { date: today, count: 1 };
    } else {
      this.dailyTracker.count++;
    }
  }

  getDailyTxCount(): number {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyTracker.date !== today) return 0;
    return this.dailyTracker.count;
  }
}
