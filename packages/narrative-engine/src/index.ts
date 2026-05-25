/**
 * @package narrative-engine
 * Generates human-readable strategy analysis reports using LLM.
 * LLM operates in READ-ONLY advisory mode — cannot trigger execution.
 */

export interface NarrativeContext {
  poolAddress: string;
  token0Symbol: string;
  token1Symbol: string;
  feeTier: number;
  tvlUsd: number;
  volume24hUsd: number;
  currentTick: number;
  tickRange: [number, number];
  positionValueUsd: number;
  pnlUsd: number;
  riskScore: number;
  drawdownPct: number;
  evaluationWindowDays: number;
}

export interface NarrativeReport {
  poolAddress: string;
  summary: string;
  recommendation: 'hold' | 'rebalance' | 'exit' | 'monitor';
  reasoning: string;
  confidence: number; // 0-1
  generatedAt: Date;
  llmModel: string;
  // NOTE: LLM output is advisory only. Never auto-execute based on this.
}

export interface NarrativeEngineConfig {
  llmApiKey: string;     // loaded from env, never hardcoded
  llmBaseUrl: string;    // e.g. vLLM sandbox endpoint
  llmModel: string;      // e.g. 'meta-llama/Llama-3.1-8B-Instruct'
  maxTokens: number;
  sandboxMode: boolean;  // v1: always true for LLM
}

/**
 * NarrativeEngine — LLM-powered advisory report generator.
 * IMPORTANT: Output is strictly advisory. Human approval required for live action.
 */
export class NarrativeEngine {
  private config: NarrativeEngineConfig;

  constructor(config: NarrativeEngineConfig) {
    if (!config.sandboxMode) {
      throw new Error('NarrativeEngine must run in sandboxMode=true (v1 constraint)');
    }
    this.config = config;
  }

  async generateReport(ctx: NarrativeContext): Promise<NarrativeReport> {
    const prompt = this.buildPrompt(ctx);
    const llmOutput = await this.callLLM(prompt);
    return this.parseReport(llmOutput, ctx);
  }

  private buildPrompt(ctx: NarrativeContext): string {
    return [
      `Analyze the following Uniswap v3 liquidity position and provide a brief advisory report.`,
      `Pool: ${ctx.token0Symbol}/${ctx.token1Symbol} (fee: ${ctx.feeTier / 10000}%)`,
      `TVL: $${ctx.tvlUsd.toLocaleString()} | 24h Volume: $${ctx.volume24hUsd.toLocaleString()}`,
      `Position value: $${ctx.positionValueUsd.toLocaleString()} | PnL: $${ctx.pnlUsd.toLocaleString()}`,
      `Risk score: ${ctx.riskScore.toFixed(3)} | Drawdown: ${(ctx.drawdownPct * 100).toFixed(2)}%`,
      `Evaluation window: ${ctx.evaluationWindowDays} days`,
      ``,
      `Provide: summary (2 sentences), recommendation (hold/rebalance/exit/monitor), reasoning (3 sentences), confidence (0-1).`,
      `Format as JSON: { summary, recommendation, reasoning, confidence }`,
    ].join('\n');
  }

  private async callLLM(prompt: string): Promise<string> {
    // TODO: implement HTTP call to vLLM sandbox endpoint
    // Returns raw LLM text response
    return JSON.stringify({
      summary: 'Position is within normal parameters.',
      recommendation: 'monitor',
      reasoning: 'Risk score is acceptable. Volume is healthy. No immediate action needed.',
      confidence: 0.75,
    });
  }

  private parseReport(raw: string, ctx: NarrativeContext): NarrativeReport {
    try {
      const parsed = JSON.parse(raw);
      return {
        poolAddress: ctx.poolAddress,
        summary: parsed.summary ?? '',
        recommendation: parsed.recommendation ?? 'monitor',
        reasoning: parsed.reasoning ?? '',
        confidence: parsed.confidence ?? 0,
        generatedAt: new Date(),
        llmModel: this.config.llmModel,
      };
    } catch {
      return {
        poolAddress: ctx.poolAddress,
        summary: 'Failed to parse LLM output.',
        recommendation: 'monitor',
        reasoning: 'Parse error — manual review required.',
        confidence: 0,
        generatedAt: new Date(),
        llmModel: this.config.llmModel,
      };
    }
  }
}

export default NarrativeEngine;
