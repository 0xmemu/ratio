/**
 * @ratio/policy-engine
 * Source of truth for all hard constraints
 * File-backed and database-versioned policy enforcement
 *
 * Policy sections:
 * - chain scope (Ethereum mainnet only in v1)
 * - protocol scope (v3 live, v4 discovery only)
 * - wallet routing
 * - capital caps
 * - pool eligibility
 * - token veto rules
 * - gas ceilings
 * - drawdown limits
 * - approval thresholds
 * - LLM permissions by mode
 */

export interface PolicySnapshot {
  version: string;
  createdAt: Date;
  chainScope: ChainPolicy;
  protocolScope: ProtocolPolicy;
  capitalPolicy: CapitalPolicy;
  poolPolicy: PoolPolicy;
  tokenPolicy: TokenPolicy;
  gasPolicy: GasPolicy;
  riskPolicy: RiskPolicy;
  approvalPolicy: ApprovalPolicy;
  llmPolicy: LlmPolicy;
}

export interface ChainPolicy {
  allowedChainIds: number[]; // [1] - mainnet only
}

export interface ProtocolPolicy {
  v3LiveEnabled: boolean;
  v4Mode: 'discovery' | 'simulation' | 'restricted_live';
  allowedFeeTiersBps: number[]; // [500, 3000]
}

export interface CapitalPolicy {
  coreIncomePct: number;      // 0.65
  activeBalancedPct: number;  // 0.25
  layeredPositionsPct: number;// 0.10
  experimentalPct: number;    // 0.00
  maxPortfolioPctPerPool: number; // 0.08
  maxTokenExposurePct: number;    // 0.30
}

export interface PoolPolicy {
  minDailyVolumeUsd: number;  // 1_000_000
  minTvlUsd: number;          // 500_000
  allowNewListings: boolean;   // false
  blueChipOnly: boolean;       // true
}

export interface TokenPolicy {
  blockUpgradeableUnknown: boolean; // true
  blockTaxTokens: boolean;          // true
  maxRiskScore: number;             // 0.35
}

export interface GasPolicy {
  dailyBudgetUsd: number;       // 10
  highRegimeGwei: number;       // 80
  extremeRegimeGwei: number;    // 150
  maxGasToFeeRatio: number;     // 0.35
}

export interface RiskPolicy {
  maxDrawdownPct: number;       // 0.03
  minNetProfitUsd: number;      // 100
  evaluationWindowDays: number; // 7
  requireNarrativeConfidenceMin: number; // 0.55
}

export interface ApprovalPolicy {
  requireHumanApprovalForPromotion: boolean; // true always
  twoStepConfirmationThresholdUsd: number;
  authorizedChatId: string; // from env only
}

export interface LlmPolicy {
  allowedInModes: ('research' | 'dryrun')[];
  canCreateDrafts: boolean;           // true
  canPromoteToLive: boolean;          // false - NEVER
  canOverrideRiskVeto: boolean;       // false - NEVER
  canSignTransactions: boolean;       // false - NEVER
  maxNarrativeScoreWeight: number;    // 0.10
}

export function loadDefaultPolicy(): PolicySnapshot {
  return {
    version: '1.0.0',
    createdAt: new Date(),
    chainScope: { allowedChainIds: [1] },
    protocolScope: {
      v3LiveEnabled: true,
      v4Mode: 'discovery',
      allowedFeeTiersBps: [500, 3000],
    },
    capitalPolicy: {
      coreIncomePct: 0.65,
      activeBalancedPct: 0.25,
      layeredPositionsPct: 0.10,
      experimentalPct: 0.00,
      maxPortfolioPctPerPool: 0.08,
      maxTokenExposurePct: 0.30,
    },
    poolPolicy: {
      minDailyVolumeUsd: 1_000_000,
      minTvlUsd: 500_000,
      allowNewListings: false,
      blueChipOnly: true,
    },
    tokenPolicy: {
      blockUpgradeableUnknown: true,
      blockTaxTokens: true,
      maxRiskScore: 0.35,
    },
    gasPolicy: {
      dailyBudgetUsd: 10,
      highRegimeGwei: 80,
      extremeRegimeGwei: 150,
      maxGasToFeeRatio: 0.35,
    },
    riskPolicy: {
      maxDrawdownPct: 0.03,
      minNetProfitUsd: 100,
      evaluationWindowDays: 7,
      requireNarrativeConfidenceMin: 0.55,
    },
    approvalPolicy: {
      requireHumanApprovalForPromotion: true,
      twoStepConfirmationThresholdUsd: 500,
      authorizedChatId: process.env['TELEGRAM_AUTHORIZED_CHAT_ID'] ?? '',
    },
    llmPolicy: {
      allowedInModes: ['research', 'dryrun'],
      canCreateDrafts: true,
      canPromoteToLive: false,
      canOverrideRiskVeto: false,
      canSignTransactions: false,
      maxNarrativeScoreWeight: 0.10,
    },
  };
}
