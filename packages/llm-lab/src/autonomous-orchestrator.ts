/**
 * autonomous-orchestrator.ts
 * Stage 5 — Wires all LLM-lab components into a single autonomous LP pipeline.
 * IMPORTANT: LLM output is ADVISORY only. No live execution in sandbox mode.
 * All decisions pass through validation pipeline before any action.
 */

import { MarketAnalyzer } from './market-analyzer';
import { StrategyAgent } from './strategy-agent';
import { Backtester } from './backtester';
import { SimulationLab } from './simulation-lab';
import { RiskAgent } from './risk-agent';
import { DecisionEngine } from './decision-engine';
import { VectorMemory } from './vector-memory';
import { PerformanceRecall } from './performance-recall';
import { ReinforcementEngine } from './reinforcement-engine';
import type { LLMGateway } from '../../../llm-gateway/src/index';
import type { PoolMetrics } from './market-analyzer';
import type { HistoricalSnapshot } from './backtester';
import type { DecisionAction } from './decision-engine';

export interface OrchestratorConfig {
  sandboxMode: boolean;    // must be true in v1
  useLLM: boolean;         // whether to call LLM for rationale
  initialCapitalUsd: number;
  gasCostUsd: number;
  rebalanceFrequencyPerMonth: number;
}

export interface PipelineResult {
  poolAddress: string;
  action: DecisionAction;
  opportunityScore: number;
  riskLevel: string;
  strategyType: string;
  confidence: number;
  simulatedProfitUsd: number;
  decision: string;
  llmRationale?: string;
  approved: boolean;
  timestamp: number;
}

export class AutonomousOrchestrator {
  private marketAnalyzer = new MarketAnalyzer();
  private strategyAgent = new StrategyAgent();
  private backtester = new Backtester();
  private simulationLab = new SimulationLab();
  private riskAgent = new RiskAgent();
  private decisionEngine = new DecisionEngine();
  private vectorMemory = new VectorMemory();
  private performanceRecall = new PerformanceRecall();
  private reinforcementEngine = new ReinforcementEngine();

  constructor(private config: OrchestratorConfig) {
    if (!config.sandboxMode) {
      throw new Error('AutonomousOrchestrator: sandboxMode must be true in v1');
    }
  }

  /**
   * Full pipeline: analyze → strategy → backtest → simulate → risk → decide
   * Returns advisory output only. No execution side-effects.
   */
  async run(
    metrics: PoolMetrics,
    snapshots: HistoricalSnapshot[],
    llm?: LLMGateway
  ): Promise<PipelineResult> {
    // Stage 1: Market Analysis
    const opportunity = this.config.useLLM && llm
      ? await this.marketAnalyzer.analyzeWithLLM(metrics, llm)
      : this.marketAnalyzer.analyze(metrics);

    // Stage 2: Strategy Generation (with RL weight adjustments)
    let strategy = this.config.useLLM && llm
      ? await this.strategyAgent.generateWithLLM(opportunity, llm)
      : this.strategyAgent.generate(opportunity);

    // Apply RL learned weights
    const rlAdjusted = this.reinforcementEngine.applyWeights(
      strategy.confidence,
      strategy.recommendedRangeBps
    );
    strategy = {
      ...strategy,
      confidence: rlAdjusted.confidence,
      recommendedRangeBps: rlAdjusted.rangeBps,
    };

    // Apply memory-based confidence adjustment
    const queryVector = this.vectorMemory.buildVector({
      feeApr: opportunity.feeAnalysis.feeApr,
      volatilityScore: metrics.volatilityScore,
      confidence: strategy.confidence,
      strategyType: strategy.strategyType,
      timestamp: metrics.timestamp,
    });
    const similar = this.performanceRecall.recallSimilar(this.vectorMemory, queryVector);
    const confidenceAdj = this.performanceRecall.getConfidenceAdjustment(similar);
    strategy = {
      ...strategy,
      confidence: Math.min(95, strategy.confidence * confidenceAdj),
    };

    // Stage 2b: Backtest
    const backtest = this.backtester.run(strategy, snapshots);

    // Stage 2c: Simulation scenarios
    const simulation = this.simulationLab.simulate(strategy, {
      initialCapitalUsd: this.config.initialCapitalUsd,
      estimatedApr: opportunity.feeAnalysis.feeApr / 100,
      gasCostUsd: this.config.gasCostUsd,
      rebalanceFrequencyPerMonth: this.config.rebalanceFrequencyPerMonth,
      holdingPeriodDays: 30,
    });

    // Stage 3: Risk Assessment
    const risk = this.riskAgent.assess(strategy, backtest);

    // Stage 3: Decision
    const decision = this.config.useLLM && llm
      ? await this.decisionEngine.decideWithLLM(opportunity, strategy, backtest, risk, llm)
      : this.decisionEngine.decide(opportunity, strategy, backtest, risk);

    // Store in vector memory for future recall
    this.vectorMemory.store_embedding({
      id: `${metrics.poolAddress}-${Date.now()}`,
      poolAddress: metrics.poolAddress,
      strategyType: strategy.strategyType,
      vector: queryVector,
      metadata: {
        timestamp: Date.now(),
        feeApr: opportunity.feeAnalysis.feeApr,
        volatilityScore: metrics.volatilityScore,
        confidence: strategy.confidence,
        outcome: 'unknown',
      },
    });

    return {
      poolAddress: metrics.poolAddress,
      action: decision.action,
      opportunityScore: opportunity.score,
      riskLevel: risk.level,
      strategyType: strategy.strategyType,
      confidence: strategy.confidence,
      simulatedProfitUsd: simulation.projectedAnnualProfitUsd,
      decision: decision.summary,
      llmRationale: decision.llmReasoning ?? opportunity.llmRationale,
      approved: risk.approved && decision.action === 'enter',
      timestamp: Date.now(),
    };
  }

  /**
   * Record actual outcome of a previous decision cycle to train the RL engine.
   */
  recordOutcome(
    id: string,
    actualProfitUsd: number,
    strategyType: string,
    volatilityBucket: 'low' | 'medium' | 'high' | 'extreme',
    feeAprBucket: 'poor' | 'fair' | 'good' | 'excellent'
  ): void {
    const outcome = actualProfitUsd >= 0 ? 'profitable' as const : 'loss' as const;
    this.vectorMemory.updateOutcome(id, outcome, actualProfitUsd);
    this.reinforcementEngine.update({
      state: { volatilityBucket, feeAprBucket, strategyType },
      action: { adjustConfidenceBy: 0, adjustRangeBy: 0 },
      reward: actualProfitUsd,
      timestamp: Date.now(),
    });
  }

  getMemorySize(): number { return this.vectorMemory.size(); }
  getRLWeights() { return this.reinforcementEngine.getWeights(); }
  getPerformanceSummary() { return this.performanceRecall.getSummary(); }
}

export default AutonomousOrchestrator;
