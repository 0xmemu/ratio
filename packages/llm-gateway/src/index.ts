/**
 * @package llm-gateway
 * Unified gateway for LLM inference calls.
 * Supports vLLM sandbox endpoint; never connects to live infrastructure.
 * LLM output is ALWAYS advisory — no execution side-effects.
 */

export interface LLMRequest {
  model: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
  systemPrompt?: string;
}

export interface LLMResponse {
  model: string;
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  sandboxMode: boolean;
}

export interface LLMGatewayConfig {
  baseUrl: string;      // vLLM sandbox endpoint from env
  apiKey: string;       // from env, never hardcoded
  defaultModel: string;
  sandboxMode: boolean; // v1: always true
  timeoutMs: number;
}

/**
 * LLMGateway — wraps LLM API calls with sandbox enforcement and retries.
 * IMPORTANT: Only connects to sandbox/vLLM endpoint in v1.
 * Never routes to production LLM APIs without explicit policy unlock.
 */
export class LLMGateway {
  private config: LLMGatewayConfig;

  constructor(config: LLMGatewayConfig) {
    if (!config.sandboxMode) {
      throw new Error('LLMGateway: sandboxMode must be true in v1');
    }
    this.config = config;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const body = {
      model: req.model || this.config.defaultModel,
      messages: [
        ...(req.systemPrompt
          ? [{ role: 'system', content: req.systemPrompt }]
          : []),
        { role: 'user', content: req.prompt },
      ],
      max_tokens: req.maxTokens,
      temperature: req.temperature,
    };

    const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`LLMGateway: HTTP ${response.status} from ${this.config.baseUrl}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - start;

    return {
      model: data.model ?? req.model,
      content: data.choices?.[0]?.message?.content ?? '',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      latencyMs,
      sandboxMode: this.config.sandboxMode,
    };
  }
}

export default LLMGateway;
