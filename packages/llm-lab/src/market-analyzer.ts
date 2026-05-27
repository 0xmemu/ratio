import type { LLMGateway } from '../../../llm-gateway/src/index';

export interface PoolMetrics {
  poolAddress: string;
  token0Symbol: string;
  token1Symbol: string;
  feeTier: number;
  volume24h: number;
  fees24h: number;
  liquidityUsd: number;
  volatilityScore: number;
  timestamp: number;
}

export interface VolatilityProfile {
  score: number;
  classification: 'low' | 'medium' | 'high' | 'extreme';
  avgPriceDeviationPct: number;
  recommendation: string;
}

export interface FeeAnalysis {
  feeApr: number;
  feeDensity: number;
  efficiency: 'poor' | 'fair' | 'good' | 'excellent';
}

export interface PoolOpportunity {
  score: number;
  reason: string;
  volatility: VolatilityProfile;
  feeAnalysis: FeeAnalysis;
  metrics: PoolMetrics;
  llmRationale?: string;
}

// ── VolatilityTracker ────────────────────────────────────────────────────────

export class VolatilityTracker {
  classify(score: number): VolatilityProfile {
    if (score <= 2) {
      return {
        score,
        classification: 'low',
        avgPriceDeviationPct: score * 0.15,
        recommendation: 'Narrow range LP viable — low IL risk',
      };
    } else if (score <= 5) {
      return {
        score,
        classification: 'medium',
        avgPriceDeviationPct: score * 0.3,
        recommendation: 'Medium range LP — monitor rebalance frequency',
      };
    } else if (score <= 7) {
      return {
        score,
        classification: 'high',
        avgPriceDeviationPct: score * 0.5,
        recommendation: 'Wide range LP — reduce position size',
      };
    } else {
      return {
        score,
        classification: 'extreme',
        avgPriceDeviationPct: score * 0.8,
        recommendation: 'Avoid concentrated LP — consider stable pairs only',
      };
    }
  }
}

// ── FeeAnalyzer ──────────────────────────────────────────────────────────────

export class FeeAnalyzer {
  analyze(metrics: PoolMetrics): FeeAnalysis {
    const feeApr =
      metrics.liquidityUsd > 0
        ? (metrics.fees24h * 365 * 100) / metrics.liquidityUsd
        : 0;
    const feeDensity =
      metrics.liquidityUsd > 0
        ? (metrics.fees24h / metrics.liquidityUsd) * 1000
        : 0;
    let efficiency: FeeAnalysis['efficiency'];
    if (feeApr < 5) efficiency = 'poor';
    else if (feeApr < 15) efficiency = 'fair';
    else if (feeApr < 50) efficiency = 'good';
    else efficiency = 'excellent';
    return { feeApr, feeDensity, efficiency };
  }
}

// ── PoolScanner ───────────────────────────────────────────────────────────────

export class PoolScanner {
  score(metrics: PoolMetrics, feeAnalysis: FeeAnalysis): number {
    const vtlRatio =
      metrics.liquidityUsd > 0 ? metrics.volume24h / metrics.liquidityUsd : 0;
    const vtlScore = Math.min(vtlRatio * 40, 40);
    const feeScore = Math.min((feeAnalysis.feeApr / 100) * 35, 35);
    const volatilityPenalty = metrics.volatilityScore * 2.5;
    return Math.max(0, vtlScore + feeScore - volatilityPenalty);
  }
}

// ── MarketAnalyzer ────────────────────────────────────────────────────────────

export class MarketAnalyzer {
  private volatilityTracker = new VolatilityTracker();
  private feeAnalyzer = new FeeAnalyzer();
  private poolScanner = new PoolScanner();

  analyze(metrics: PoolMetrics): PoolOpportunity {
    const volatility = this.volatilityTracker.classify(metrics.volatilityScore);
    const feeAnalysis = this.feeAnalyzer.analyze(metrics);
    const score = this.poolScanner.score(metrics, feeAnalysis);
    const reason = [
      `Fee APR: ${feeAnalysis.feeApr.toFixed(1)}% (${feeAnalysis.efficiency})`,
      `Volatility: ${volatility.classification} — ${volatility.recommendation}`,
      `Vol/Liq: ${
        metrics.liquidityUsd > 0
          ? (metrics.volume24h / metrics.liquidityUsd).toFixed(3)
          : 'n/a'
      }`,
    ].join(' | ');
    return { score, reason, volatility, feeAnalysis, metrics };
  }

  async analyzeWithLLM(
    metrics: PoolMetrics,
    llm: LLMGateway
  ): Promise<PoolOpportunity> {
    const base = this.analyze(metrics);
    const prompt = `You are an LP strategy analyst for a Uniswap V4 protocol.

Pool: ${metrics.token0Symbol}/${metrics.token1Symbol} (fee tier: ${
      metrics.feeTier / 10000
    }%)
24h Volume: $${metrics.volume24h.toLocaleString()}
Liquidity: $${metrics.liquidityUsd.toLocaleString()}
24h Fees: $${metrics.fees24h.toLocaleString()}
Fee APR: ${base.feeAnalysis.feeApr.toFixed(1)}%
Volatility: ${base.volatility.classification} (score ${metrics.volatilityScore}/10)
Opportunity score: ${base.score.toFixed(1)}/100

Provide a 2-sentence LP opportunity assessment. Be concise and data-driven.`;
    try {
      const response = await llm.complete({
        model: 'default',
        prompt,
        maxTokens: 120,
        temperature: 0.3,
        systemPrompt:
          'You are a DeFi LP strategy assistant. Output only the assessment, no preamble.',
      });
      return { ...base, llmRationale: response.content };
    } catch {
      return base;
    }
  }
}

export default MarketAnalyzer;
