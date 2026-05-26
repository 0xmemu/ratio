import { MarketAnalyzer } from './market-analyzer';
import { StrategyAgent } from './strategy-agent';
import { RiskAgent } from './risk-agent';
import { SimulationLab } from './simulation-lab';
import { DecisionEngine } from './decision-engine';
import type { PoolMetrics } from './market-analyzer';

export class AutonomousOrchestrator {
  private marketAnalyzer = new MarketAnalyzer();
  private strategyAgent = new StrategyAgent();
  private riskAgent = new RiskAgent();
  private simulationLab = new SimulationLab();
  private decisionEngine = new DecisionEngine();

  run(metrics: PoolMetrics) {
    const opportunity = this.marketAnalyzer.analyze(metrics);

    const strategy = this.strategyAgent.generate(opportunity);

    const risk = this.riskAgent.evaluate(strategy);

    const simulation = this.simulationLab.simulate(strategy, {
      initialCapitalUsd: 10000,
      estimatedApr: 0.18,
      gasCostUsd: 25,
      rebalanceFrequencyPerMonth: 4,
    });

    return this.decisionEngine.decide(
      opportunity,
      strategy,
      risk,
      simulation
    );
  }
}

export default AutonomousOrchestrator;
