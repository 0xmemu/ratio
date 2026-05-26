export interface PoolMetrics {
  poolAddress: string;
  volume24h: number;
  fees24h: number;
  liquidityUsd: number;
  volatilityScore: number;
  timestamp: number;
}

export interface PoolOpportunity {
  score: number;
  reason: string;
  metrics: PoolMetrics;
}

export class MarketAnalyzer {
  analyze(metrics: PoolMetrics): PoolOpportunity {
    const liquidityFactor = metrics.liquidityUsd > 0
      ? metrics.volume24h / metrics.liquidityUsd
      : 0;

    const score =
      liquidityFactor * 40 +
      metrics.fees24h * 0.001 -
      metrics.volatilityScore * 5;

    return {
      score,
      reason: 'generated from liquidity, fees, and volatility profile',
      metrics,
    };
  }
}

export default MarketAnalyzer;
