import type { StrategyProposal } from './strategy-agent';

export interface SimulationInput {
  initialCapitalUsd: number;
  estimatedApr: number;
  gasCostUsd: number;
  rebalanceFrequencyPerMonth: number;
}

export interface SimulationResult {
  projectedMonthlyProfitUsd: number;
  projectedAnnualProfitUsd: number;
  estimatedGasSpendUsd: number;
  profitable: boolean;
}

export class SimulationLab {
  simulate(
    strategy: StrategyProposal,
    input: SimulationInput
  ): SimulationResult {
    const monthlyFees =
      (input.initialCapitalUsd * input.estimatedApr) / 12;

    const gasSpend =
      input.gasCostUsd * input.rebalanceFrequencyPerMonth;

    const projectedMonthlyProfitUsd = monthlyFees - gasSpend;

    return {
      projectedMonthlyProfitUsd,
      projectedAnnualProfitUsd:
        projectedMonthlyProfitUsd * 12,
      estimatedGasSpendUsd: gasSpend,
      profitable: projectedMonthlyProfitUsd > 0,
    };
  }
}

export default SimulationLab;
