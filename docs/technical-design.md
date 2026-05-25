# Ratio — Technical Design v1

> Last updated: 2026-05-25  
> Status: Foundation complete (Phase 1 ✅, Phase 2 ✅)

## Core v1 Parameters

### Pool Universe
- Protocol: Uniswap v3 (mainnet); v4 discovery only
- Fee tiers: 500, 3000, 10000 bps
- Min TVL: $500,000
- Min 24h volume: $100,000
- Max pools tracked: 50
- Evaluation window: 15 minutes (cron)

### Risk Parameters
- Min net profit (after gas): $5.00
- Max drawdown per cycle: 2%
- Max single position: 20% of capital
- Capital splits: 3 wallets max (hot, warm, cold)
- Gas budget per tx: 300,000 units
- Gas price ceiling: 50 gwei

### Execution
- Default mode: `DRY_RUN=true`
- Live mode: requires `EXECUTION_MODE=live` + human Telegram approval
- Two-step confirmation for positions > $10,000
- Slippage tolerance: 0.5%
- Deadline: 3 minutes

### LLM Sandbox Rules
- LLM may only suggest; never sign transactions
- LLM cannot override risk vetoes
- LLM cannot self-promote strategies to live
- All LLM calls logged to `auditevents` table
- Strategy proposals expire after 24h without approval

### Telegram Gate
- Commands: `/status`, `/pending`, `/approve <id>`, `/deny <id>`, `/positions`, `/decisions`
- Only `TELEGRAM_ALLOWED_IDS` may approve/deny
- Bot cannot sign or submit transactions
- Executor reads `ApprovalEvent` before any on-chain tx

## Monorepo Structure

```
ratio/
├── apps/
│   ├── api/          # Fastify REST: /health, /pools, /scores, /positions, /decisions, /approvals, /audit
│   ├── worker/       # Cron: ingest → score → decide (DRY_RUN default)
│   ├── ops-bot/      # Telegram human-in-the-loop gate
│   ├── simulator/    # Backtest runner
│   └── strategy-lab/ # LLM strategy sandbox
├── packages/
│   ├── db/           # Prisma client + schema
│   ├── market-data/  # Pool filtering, price feeds
│   ├── protocol-v3/  # Uniswap v3 adapter
│   ├── protocol-v4/  # Uniswap v4 discovery (read-only)
│   ├── risk-engine/  # Drawdown, gas, slippage checks
│   ├── scoring-engine/     # Weighted pool ranking
│   ├── narrative-engine/   # LLM narrative analysis
│   ├── strategy-engine/    # Strategy registry
│   ├── allocation-engine/  # Capital allocation LP
│   ├── execution-engine/   # Tx builder + submitter
│   ├── policy-engine/      # Hard constraints enforcement
│   ├── llm-gateway/        # vLLM sandbox wrapper
│   ├── backtest-core/      # Tick-level simulation
│   └── allocation-engine/  # Kelly/LP capital splits
├── docs/
├── .env.example
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Data Flow

```
Market Data → Scoring → Risk Check → Decision
    ↓                                    ↓
  DB Store                         DRY_RUN?
                                   YES → log only
                                   NO  → Telegram gate
                                           ↓
                                    Human approve?
                                    YES → Executor → Chain
                                    NO  → Deny + audit
```

## Secret Handling

- All secrets via env vars; never committed to git
- `WALLET_PRIVATE_KEY` loaded at runtime only
- `DATABASE_URL`, `REDIS_URL`, `ETH_RPC_URL` via `.env`
- `.env.example` documents all required vars
- `.gitignore` blocks `.env*` files

## Implementation Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Foundation: monorepo, Prisma, env, dry-run, Telegram notifications | ✅ Done |
| 2 | Decision core: scoring, allocator, simulator, approvals, policy engine | ✅ Done |
| 3 | Live execution: executor, gas engine, hot wallet ops, staged live validation | ⏳ Next |
| 4 | LLM lab: narrative engine, strategy-lab, constrained proposal schema | ⏳ Planned |
| 5 | v4 expansion: v4 discovery, hook classifier, v4 simulation, restricted live allowlist | ⏳ Planned |
