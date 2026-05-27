import type { StrategyProposal } from './strategy-agent';

export interface SimulationInput {
  initialCapitalUsd: number;
  estimatedApr: number;
  gasCostUsd: number;
  rebalanceFrequencyPerMonth: number;
  holdingPeriodDays: number;
}

export interface SimulationScenario {
  label: string;
  aprMultiplier: number;
  volatilityMultiplier: number;
}

export interface SimulationResult {
  projectedMonthlyProfitUsd: number;
  projectedAnnualProfitUsd: number;
  estimatedGasSpendUsd: number;
  netProfitAfterGas: number;
  breakEvenDays: number;
  profitable: boolean;
  roi: number;
}

export interface ScenarioAnalysis {
  base: SimulationResult;
  bull: SimulationResult;
  bear: SimulationResult;
  recommendation: string;
}

export class SimulationLab {
  simulate(
    strategy: StrategyProposal,
    input: SimulationInput
  ): SimulationResult {
    const effectiveApr = input.estimatedApr * (strategy.confidence / 100);
    const monthlyFees = (input.initialCapitalUsd * effectiveApr) / 12;
    const gasSpend = input.gasCostUsd * input.rebalanceFrequencyPerMonth;
    const projectedMonthlyProfitUsd = monthlyFees - gasSpend;
    const projectedAnnualProfitUsd = projectedMonthlyProfitUsd * 12;
    const netProfitAfterGas = projectedAnnualProfitUsd;
    const breakEvenDays =
      projectedMonthlyProfitUsd > 0
        ? (input.gasCostUsd / projectedMonthlyProfitUsd) * 30
        : Infinity;
    const roi =
      input.initialCapitalUsd > 0
        ? (projectedAnnualProfitUsd / input.initialCapitalUsd) * 100
        : 0;
    return {
      projectedMonthlyProfitUsd,
      projectedAnnualProfitUsd,
      estimatedGasSpendUsd: gasSpend * 12,
      netProfitAfterGas,
      breakEvenDays,
      profitable: projectedMonthlyProfitUsd > 0,
      roi,
    };
  }

  runScenarios(
    strategy: StrategyProposal,
    input: SimulationInput
  ): ScenarioAnalysis {
    const scenarios: SimulationScenario[] = [
      { label: 'base', aprMultiplier: 1.0, volatilityMultiplier: 1.0 },
      { label: 'bull', aprMultiplier: 1.5, volatilityMultiplier: 0.7 },
      { label: 'bear', aprMultiplier: 0.4, volatilityMultiplier: 2.0 },
    ];

    const results = scenarios.map((s) =>
      this.simulate(strategy, {
        ...input,
        estimatedApr: input.estimatedApr * s.aprMultiplier,
        rebalanceFrequencyPerMonth:
          input.rebalanceFrequencyPerMonth * s.volatilityMultiplier,
      })
    );

    const [base, bull, bear] = results;

    let recommendation: string;
    if (bear.profitable) {
      recommendation = 'Strong signal: profitable in all scenarios';
    } else if (base.profitable) {
      recommendation = 'Moderate signal: profitable in base/bull but not bear';
    } else {
      recommendation = 'Weak signal: only profitable in bull scenario';
    }

    return { base, bull, bear, recommendation };
  }
}

export default SimulationLab;
