/**
 * @package risk-engine
 * Evaluates risk score for a given pool/position.
 * Enforces max drawdown, concentration, and volatility limits.
 */

export interface RiskParams {
  maxDrawdownPct: number;    // v1: 0.03 (3%)
  maxRiskScore: number;      // v1: 0.35
  maxConcentrationPct: number; // max % of capital in single pool
}

export interface RiskInput {
  poolAddress: string;
  currentValueUsd: number;
  peakValueUsd: number;
  volatility7d: number;      // 0-1 normalized
  concentrationPct: number;  // 0-1
  isNewListing: boolean;
}

export interface RiskAssessmentResult {
  poolAddress: string;
  riskScore: number;         // 0-1
  drawdownPct: number;
  isAllowed: boolean;
  reason?: string;
}

const DEFAULT_RISK_PARAMS: RiskParams = {
  maxDrawdownPct: 0.03,
  maxRiskScore: 0.35,
  maxConcentrationPct: 0.40,
};

/**
 * RiskEngine — evaluates whether a pool/position meets risk guardrails.
 */
export class RiskEngine {
  private params: RiskParams;

  constructor(params: Partial<RiskParams> = {}) {
    this.params = { ...DEFAULT_RISK_PARAMS, ...params };
  }

  assess(input: RiskInput): RiskAssessmentResult {
    // Block new listings (v1: ALLOW_NEW_LISTINGS=false)
    if (input.isNewListing) {
      return {
        poolAddress: input.poolAddress,
        riskScore: 1.0,
        drawdownPct: 0,
        isAllowed: false,
        reason: 'new_listing_blocked',
      };
    }

    const drawdownPct =
      input.peakValueUsd > 0
        ? (input.peakValueUsd - input.currentValueUsd) / input.peakValueUsd
        : 0;

    // Composite risk score: weighted volatility + concentration + drawdown
    const riskScore =
      0.4 * input.volatility7d +
      0.3 * input.concentrationPct +
      0.3 * (drawdownPct / this.params.maxDrawdownPct);

    const normalizedScore = Math.min(riskScore, 1.0);

    if (drawdownPct >= this.params.maxDrawdownPct) {
      return {
        poolAddress: input.poolAddress,
        riskScore: normalizedScore,
        drawdownPct,
        isAllowed: false,
        reason: 'max_drawdown_exceeded',
      };
    }

    if (normalizedScore > this.params.maxRiskScore) {
      return {
        poolAddress: input.poolAddress,
        riskScore: normalizedScore,
        drawdownPct,
        isAllowed: false,
        reason: 'risk_score_too_high',
      };
    }

    if (input.concentrationPct > this.params.maxConcentrationPct) {
      return {
        poolAddress: input.poolAddress,
        riskScore: normalizedScore,
        drawdownPct,
        isAllowed: false,
        reason: 'concentration_limit_exceeded',
      };
    }

    return {
      poolAddress: input.poolAddress,
      riskScore: normalizedScore,
      drawdownPct,
      isAllowed: true,
    };
  }
}

export default RiskEngine;
