/**
 * @module lab
 * LLM Strategy Generation Sandbox for Ratio v1.
 *
 * This is the ONLY place where LLMs may propose strategy mutations.
 * All LLM output is treated as DRAFT only — isActive is NEVER set to true here.
 * A human operator must manually promote a draft via ops-bot or API.
 *
 * Flow:
 *   1. Load current active StrategyVersion from DB
 *   2. Load recent PoolScore metrics as context
 *   3. Call LLMGateway.complete() with a constrained mutation prompt
 *   4. Parse + schema-validate the LLM response
 *   5. Persist new StrategyVersion with isActive=false (draft)
 *   6. Emit audit event — never auto-activate
 *
 * SECURITY:
 *   - LLM output NEVER modifies isActive flag
 *   - sandboxMode is enforced inside LLMGateway (throws if false)
 *   - All generated configs are schema-validated before any DB write
 *   - capitalSplits.experimental is hard-locked to 0 in v1
 *
 * To run: pnpm --filter @ratio/strategy-lab start
 */

import { db, audit } from '@ratio/db';
import { LLMGateway } from '@ratio/llm-gateway';

const LLM_BASE_URL       = process.env.LLM_BASE_URL        ?? 'http://localhost:8080';
const LLM_API_KEY        = process.env.LLM_API_KEY         ?? 'sandbox-key';
const LLM_MODEL          = process.env.LLM_MODEL           ?? 'mistral-7b-instruct';
const LLM_MAX_TOKENS     = parseInt(process.env.LLM_MAX_TOKENS  ?? '1024');
const LLM_TEMPERATURE    = parseFloat(process.env.LLM_TEMPERATURE ?? '0.3');
const CONTEXT_POOL_LIMIT = parseInt(process.env.CONTEXT_POOL_LIMIT ?? '10');
const LAB_VERSION_TAG    = process.env.LAB_VERSION_TAG ?? `lab-${Date.now()}`;

interface StrategyDraft {
  minNetProfitUsd:      number;
  evaluationWindowDays: number;
  capitalSplits: {
    coreIncome:        number;
    activeBalanced:    number;
    layeredPositions:  number;
    experimental:      0;
  };
  rationale:  string;
  confidence: number;
}

function parseLLMJson(raw: string): unknown {
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(clean);
}

function validateDraft(raw: unknown): StrategyDraft {
  if (typeof raw !== 'object' || raw === null) throw new Error('LLM output is not an object');

  const d = raw as Record<string, unknown>;
  const minNetProfitUsd      = Number(d.minNetProfitUsd);
  const evaluationWindowDays = Number(d.evaluationWindowDays);
  const confidence           = Math.min(1, Math.max(0, Number(d.confidence ?? 0.5)));
  const rationale            = typeof d.rationale === 'string' ? d.rationale.slice(0, 1000) : '';

  if (!isFinite(minNetProfitUsd) || minNetProfitUsd < 0 || minNetProfitUsd > 10_000) {
    throw new Error(`Invalid minNetProfitUsd: ${d.minNetProfitUsd}`);
  }
  if (!isFinite(evaluationWindowDays) || evaluationWindowDays < 1 || evaluationWindowDays > 90) {
    throw new Error(`Invalid evaluationWindowDays: ${d.evaluationWindowDays}`);
  }

  const splits = d.capitalSplits as Record<string, unknown> | undefined;
  if (typeof splits !== 'object' || splits === null) throw new Error('Missing capitalSplits');

  const coreIncome       = Number(splits.coreIncome);
  const activeBalanced   = Number(splits.activeBalanced);
  const layeredPositions = Number(splits.layeredPositions);

  for (const [k, v] of Object.entries({ coreIncome, activeBalanced, layeredPositions })) {
    if (!isFinite(v) || v < 0 || v > 1) throw new Error(`Invalid capitalSplits.${k}: ${v}`);
  }

  const total = coreIncome + activeBalanced + layeredPositions;
  if (Math.abs(total - 1.0) > 0.01) throw new Error(`capitalSplits must sum to 1.0, got ${total.toFixed(4)}`);

  return { minNetProfitUsd, evaluationWindowDays, capitalSplits: { coreIncome, activeBalanced, layeredPositions, experimental: 0 }, rationale, confidence };
}

async function buildContext(): Promise<string> {
  const scores = await db.poolScore.findMany({
    orderBy: { createdAt: 'desc' },
    distinct: ['poolId'],
    take: CONTEXT_POOL_LIMIT,
    include: { pool: { select: { address: true, token0Symbol: true, token1Symbol: true, feeTier: true } } },
  });

  const scoreLines = scores.map((s) =>
    `- ${s.pool.token0Symbol}/${s.pool.token1Symbol} (fee=${s.pool.feeTier}) ` +
    `score=${s.score.toFixed(3)} netProfit7d=$${(s.netProfitUsd7d ?? 0).toFixed(2)}`
  );

  return scoreLines.join('\n');
}

function buildPrompt(currentConfig: Record<string, unknown>, context: string): string {
  return `You are a Uniswap v3 liquidity strategy advisor operating in a CONSTRAINED SANDBOX.

## Current Active Strategy Config
${JSON.stringify(currentConfig, null, 2)}

## Recent Pool Performance (top ${CONTEXT_POOL_LIMIT} by score)
${context}

## Your Task
Propose a single strategy config mutation as a JSON object. You must:
1. Keep all values within safe bounds
2. Only adjust parameters that are clearly supported by the pool data
3. Return ONLY raw JSON — no markdown, no explanation outside the JSON

## Required JSON Schema
{
  "minNetProfitUsd": number,          // range: 50 – 500
  "evaluationWindowDays": number,     // range: 3 – 30
  "capitalSplits": {
    "coreIncome": number,             // range: 0.5 – 0.8
    "activeBalanced": number,         // range: 0.1 – 0.4
    "layeredPositions": number        // range: 0.05 – 0.2
    // NOTE: coreIncome + activeBalanced + layeredPositions MUST equal 1.0
    // experimental is always 0 — do NOT include it
  },
  "rationale": string,                // max 500 chars — explain your reasoning
  "confidence": number                // 0.0 – 1.0
}

Respond with ONLY the JSON object.`;
}

export async function runStrategyLab(): Promise<void> {
  console.log('[strategy-lab] Initializing LLM gateway (sandbox mode)...');

  const gateway = new LLMGateway({
    baseUrl:      LLM_BASE_URL,
    apiKey:       LLM_API_KEY,
    defaultModel: LLM_MODEL,
    sandboxMode:  true,
    timeoutMs:    30_000,
  });

  const activeStrategy = await db.strategyVersion.findFirst({
    where:   { isActive: true },
    orderBy: { activatedAt: 'desc' },
  });

  const currentConfig = activeStrategy?.config ?? {
    minNetProfitUsd:      100,
    evaluationWindowDays: 7,
    dryRun:               true,
    capitalSplits: { coreIncome: 0.65, activeBalanced: 0.25, layeredPositions: 0.10, experimental: 0.00 },
  };

  console.log('[strategy-lab] Active strategy:', activeStrategy?.version ?? 'none (using defaults)');
  console.log('[strategy-lab] Building pool performance context...');
  const context = await buildContext();
  console.log(`[strategy-lab] Calling LLM model: ${LLM_MODEL} (temp=${LLM_TEMPERATURE})...`);

  const llmResponse = await gateway.complete({
    model:        LLM_MODEL,
    prompt:       buildPrompt(currentConfig as Record<string, unknown>, context),
    maxTokens:    LLM_MAX_TOKENS,
    temperature:  LLM_TEMPERATURE,
    systemPrompt: 'You are a financial strategy advisor. Output ONLY valid JSON.',
  });

  console.log(`[strategy-lab] LLM responded (${llmResponse.usage.totalTokens} tokens, ${llmResponse.latencyMs}ms)`);

  let draft: StrategyDraft;
  try {
    const parsed = parseLLMJson(llmResponse.content);
    draft = validateDraft(parsed);
  } catch (err) {
    console.error('[strategy-lab] LLM output validation FAILED:', err);
    console.error('[strategy-lab] Raw LLM output:', llmResponse.content);
    await audit('lab_validation_failed', 'strategy_lab', 'system', 'system', {
      model: LLM_MODEL, error: String(err), rawOutput: llmResponse.content.slice(0, 500),
    });
    return;
  }

  console.log(`[strategy-lab] Draft validated — confidence=${draft.confidence.toFixed(2)}`);
  console.log(`[strategy-lab] Rationale: ${draft.rationale}`);

  const newVersion = await db.strategyVersion.create({
    data: {
      version:     LAB_VERSION_TAG,
      description: `[LLM Draft] confidence=${draft.confidence.toFixed(2)} | ${draft.rationale.slice(0, 200)}`,
      isActive:    false,
      activatedAt: null,
      config: {
        minNetProfitUsd:      draft.minNetProfitUsd,
        evaluationWindowDays: draft.evaluationWindowDays,
        dryRun:               true,
        capitalSplits:        draft.capitalSplits,
      },
    },
  });

  console.log(`[strategy-lab] Draft saved: id=${newVersion.id} version=${newVersion.version}`);

  await audit('lab_draft_created', 'strategy_version', newVersion.id, 'system', {
    model:           LLM_MODEL,
    confidence:      draft.confidence,
    rationale:       draft.rationale,
    promptTokens:    llmResponse.usage.promptTokens,
    completionTokens: llmResponse.usage.completionTokens,
    latencyMs:       llmResponse.latencyMs,
    baseVersion:     activeStrategy?.version ?? 'default',
  }, newVersion.id);

  console.log('[strategy-lab] Audit event logged.');
  console.log('[strategy-lab] ── Draft Config ─────────────────────────────');
  console.log(JSON.stringify(draft, null, 2));
  console.log('[strategy-lab] Done. A human operator must activate this draft via ops-bot or API.');
}
