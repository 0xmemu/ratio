# Ratio — Architecture Overview (v1)

## System Design

Ratio is a private, non-custodial, LLM-augmented LP strategy system for Uniswap v3/v4.
All components are organized in a pnpm monorepo with Turborepo for build orchestration.

---

## Monorepo Structure

```
ratio/
├── apps/
│   ├── api/           # REST API for monitoring and control
│   ├── worker/        # Background job runner (cron-based)
│   ├── ops-bot/       # Telegram ops bot for alerts and approvals
│   ├── simulator/     # Backtesting runner
│   └── strategy-lab/  # Strategy research UI (read-only)
├── packages/
│   ├── policy-engine/     # Governance gate (approve/reject actions)
│   ├── protocol-v3/       # Uniswap v3 live adapter
│   ├── protocol-v4/       # Uniswap v4 discovery adapter (hooks)
│   ├── market-data/       # Pool data fetcher and normalizer
│   ├── risk-engine/       # Risk scoring and guardrails
│   ├── narrative-engine/  # LLM advisory report generator
│   ├── scoring-engine/    # Pool/strategy ranking
│   ├── strategy-engine/   # Enter/rebalance/exit/hold decisions
│   ├── allocation-engine/ # Capital bucket distribution
│   ├── execution-engine/  # On-chain LP execution (dry-run default)
│   ├── llm-gateway/       # vLLM sandbox inference gateway
│   └── backtest-core/     # Tick-level LP simulation engine
├── packages/db/           # Prisma ORM + PostgreSQL schema
├── infra/                 # Docker Compose, deployment configs
└── docs/                  # Architecture, ADRs, runbooks
```

---

## v1 Parameters

| Parameter | Value |
|---|---|
| Pool universe | Blue-chip only (no new listings) |
| Allowed fee tiers | 500 (0.05%), 3000 (0.3%) |
| Min daily volume | $1,000,000 |
| Min TVL | $500,000 |
| Evaluation window | 7 days |
| Min net profit | $100 USD |
| Max drawdown | 3% |
| Max risk score | 0.35 |
| Capital split | Core 65% / Active 25% / Layered 10% / Experimental 0% |
| Daily gas budget | $10 USD |
| Execution mode | DRY_RUN (default) |
| LLM mode | Sandbox only (advisory, no execution) |

---

## Data Flow

```
market-data → risk-engine → scoring-engine → strategy-engine
                                                    ↓
                                          policy-engine (gate)
                                                    ↓
                                          execution-engine (dry-run/live)

narrative-engine (LLM) ← scoring-engine (advisory only)
ops-bot → Telegram alerts + human approval channel
```

---

## Security Rules

- Private key: loaded from secret manager env var only, never stored in repo
- Secrets: all in `.env` (gitignored), templated in `.env.example`
- LLM: sandbox-only in v1, cannot trigger execution
- Live mode: requires `EXECUTION_MODE=live` + policy engine approval
- Approval: all non-`hold` actions require `policyApprovalId` before execution
- Human override: Telegram ops-bot can pause/resume/reject any action

---

## Protocols

- **Uniswap v3**: Live LP management via `protocol-v3` adapter
- **Uniswap v4**: Discovery mode only in v1; hooks cataloged, not executed (`protocol-v4`)

---

## Database (Prisma + PostgreSQL)

Models: `Pool`, `PoolSnapshot`, `StrategyVersion`, `Position`, `RebalanceDecision`,
`SimulationRun`, `NarrativeReport`, `RiskAssessment`, `Approval`, `AuditEvent`, `ServiceHeartbeat`

All state changes are append-only audit events.

---

## Deployment

- Local: `docker-compose up` (PostgreSQL + Redis + API + Worker)
- Production: private VPS / cloud; secrets via environment variables
- CI: Turborepo caching; test before deploy
