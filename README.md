# ratio

> Production-oriented LP automation agent for Ethereum — Uniswap v3/v4 concentrated liquidity management

![Private](https://img.shields.io/badge/visibility-private-red)
![Status](https://img.shields.io/badge/status-phase%201%20foundation-blue)
![Mode](https://img.shields.io/badge/default%20mode-dry--run-yellow)

## Overview

Ratio is a production-oriented LP automation agent for Ethereum that manages Uniswap v3 concentrated liquidity positions and selectively evaluates Uniswap v4 opportunities. It is designed with strict separation between dry-run learning and live execution.

## Core Principles

- **Deterministic live execution** — production path is policy-bound, never ad hoc
- **LLM in sandbox only** — AI-driven experimentation is allowed only in dry-run and simulation environments
- **Versioned strategy promotion** — every strategy must be versioned, scored, and explicitly approved before going live
- **Quantitative + narrative** — pair selection combines market data with qualitative analysis, with hard risk filters that can veto LLM suggestions

## Operating Modes

| Mode | Capital | LLM Freedom | Execution |
|------|---------|-------------|----------|
| `research` | none | high | none |
| `dryrun` | none | medium | none |
| `staging` | capped | none | limited |
| `production` | policy-defined | none | full |

## Monorepo Structure

```
ratio/
├── apps/
│   ├── api/              # ratio-api: REST control plane
│   ├── worker/           # ratio-worker: scheduled jobs
│   ├── ops-bot/          # ratio-ops-bot: Telegram interface
│   ├── simulator/        # ratio-simulator: dry-run & replay
│   └── strategy-lab/     # ratio-strategy-lab: LLM strategy generation
├── packages/
│   ├── config/           # shared config
│   ├── db/               # Prisma schema & client
│   ├── logger/           # structured JSON logger
│   ├── types/            # shared TypeScript types
│   ├── policy-engine/    # hard constraint enforcement
│   ├── protocol-v3/      # Uniswap v3 adapter
│   ├── protocol-v4/      # Uniswap v4 adapter (discovery only)
│   ├── market-data/      # pool & token data ingestion
│   ├── risk-engine/      # veto checks & risk scoring
│   ├── narrative-engine/ # LLM-powered pair narrative
│   ├── scoring-engine/   # composite pair scoring
│   ├── strategy-engine/  # strategy registry & lifecycle
│   ├── allocation-engine/# capital allocation
│   ├── execution-engine/ # tx build & submit
│   ├── telemetry/        # metrics & observability
│   ├── llm-gateway/      # unified LLM interface
│   └── backtest-core/    # simulation primitives
├── infra/
│   ├── docker/
│   └── systemd/
├── migrations/           # PostgreSQL migrations
├── scripts/              # ops & setup scripts
├── docs/
│   ├── adr/              # Architecture Decision Records
│   ├── runbooks/
│   └── technical-design.md
└── output/               # simulation output artifacts
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment config
cp .env.example .env
# Edit .env with your RPC URL, DB credentials, etc.

# Start infrastructure
docker-compose up -d postgres redis

# Run database migrations
pnpm db:migrate

# Start in dry-run mode (default)
pnpm dev
```

## Environment

All secrets must be provided via environment variables. **Never commit secrets to git.** See `.env.example`.

Required secrets:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `ETH_RPC_URL` — Ethereum mainnet RPC (Alchemy/Infura/etc)
- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `TELEGRAM_AUTHORIZED_CHAT_ID` — authorized Telegram user/chat ID
- `LLM_API_KEY` — LLM provider API key (dry-run & narrative only)
- `WALLET_PRIVATE_KEY` — hot wallet private key (loaded at runtime, never stored in git)

## Implementation Phases

- [x] **Phase 1** — Foundation: monorepo, PostgreSQL/Redis, v3 adapter, market ingest, risk engine basics, dry-run only, Telegram notifications
- [ ] **Phase 2** — Decision core: scoring engine, allocator, simulator, registry, approvals, policy engine
- [ ] **Phase 3** — Live execution: executor, gas engine, hot wallet ops, staged live validation, rollback logic
- [ ] **Phase 4** — LLM lab: narrative engine, strategy-lab, constrained proposal schema, candidate promotion flow
- [ ] **Phase 5** — v4 expansion: v4 discovery, hook classifier, v4 simulation, restricted live allowlist

## Security

- `DRY_RUN=true` is the default. Live execution requires explicit opt-in via policy and human approval.
- LLM may never sign transactions, override risk vetoes, or self-promote strategies.
- All approval actions are logged immutably in `auditevents`.
- Two-step confirmation required for actions above capital threshold.

## License

Private — all rights reserved.
