# ratio

> Production-oriented LP automation agent for Ethereum — Uniswap v3/v4 concentrated liquidity management

![Status](https://img.shields.io/badge/status-phase%202%20decision%20core-blue)
![Mode](https://img.shields.io/badge/default%20mode-dry--run-yellow)
![Node](https://img.shields.io/badge/node-%3E%3D20-green)
![pnpm](https://img.shields.io/badge/pnpm-9-orange)

## Overview

Ratio is a production-oriented LP automation agent for Ethereum that manages Uniswap v3 concentrated liquidity positions and selectively evaluates Uniswap v4 opportunities. It operates with strict separation between dry-run learning and live execution.

## Core Principles

- **Deterministic live execution** — production path is policy-bound, never ad hoc
- **LLM in sandbox only** — AI-driven experimentation is allowed only in dry-run and simulation environments
- **Versioned strategy promotion** — every strategy must be versioned, scored, and explicitly approved before going live
- **Quantitative + narrative** — pair selection combines market data with qualitative analysis, with hard risk filters that can veto LLM suggestions
- **Auto port selection** — if `APP_PORT` is already in use, ratio automatically selects the next available port

## Operating Modes

| Mode | Capital | LLM Freedom | Execution |
|------|---------|-------------|----------|
| `research` | none | high | none |
| `dryrun` | none | medium | none |
| `staging` | capped | none | limited |
| `production` | policy-defined | none | full |

## Quick Start

```bash
# 1. Clone and enter the repo
git clone https://github.com/0xmemu/ratio.git
cd ratio

# 2. One-command setup (installs deps, starts docker, migrates DB, builds)
bash scripts/setup.sh

# Or use Make:
make setup
```

Or step by step:

```bash
# Install dependencies
pnpm install

# Copy environment config
cp .env.example .env
# Edit .env with your RPC URL, DB credentials, Telegram token, etc.

# Start infrastructure (postgres + redis)
make infra-up
# or: docker compose up -d postgres redis

# Generate Prisma client + run migrations
make db-generate
make db-migrate

# Start in dry-run mode
make dev
```

## Services

| Service | Command | Default Port | Description |
|---------|---------|-------------|-------------|
| **API** | `make start-api` | 3000 (auto-fallback) | REST control plane |
| **Worker** | `make start-worker` | — | Cron scheduler: ingest/score/decide/execute |
| **Ops Bot** | `make start-bot` | — | Telegram approval gate |

All services start with `pnpm dev` or individually via `make start-*`.

## Make Targets

```bash
make help          # Show all available targets
make setup         # Full first-time setup
make dev           # Start all in dev/watch mode
make db-migrate    # Apply pending DB migrations
make db-studio     # Open Prisma Studio (browser DB UI)
make infra-up      # Start postgres + redis
make infra-down    # Stop all containers
make health        # Check API health endpoint
make scores        # Show latest pool scores
make pending       # Show pending rebalance decisions
make positions     # Show open positions
```

## Environment Variables

All secrets via environment variables. **Never commit secrets to git.** See `.env.example` for full reference.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `ETH_RPC_URL` | Yes | Ethereum mainnet RPC (Alchemy/Infura) |
| `UNISWAP_SUBGRAPH_URL` | No | Uniswap v3 subgraph URL (has default) |
| `TELEGRAM_BOT_TOKEN` | Yes* | Telegram bot token (*required for ops-bot) |
| `TELEGRAM_ALLOWED_IDS` | Yes* | Comma-separated authorized Telegram user IDs |
| `LLM_API_KEY` | No | LLM provider API key (dry-run & narrative only) |
| `WALLET_PRIVATE_KEY` | Live only | Hot wallet private key (never stored in git) |
| `APP_PORT` | No | API port (default: 3000, auto-fallback if occupied) |
| `EXECUTION_MODE` | No | `dry_run` (default) or `live` |

## Monorepo Structure

```
ratio/
├── apps/
│   ├── api/               # REST control plane (:3000)
│   ├── worker/            # Cron scheduler (ingest/score/decide/execute)
│   ├── ops-bot/           # Telegram human-in-the-loop approval gate
│   ├── simulator/         # Dry-run replay engine
│   └── strategy-lab/      # LLM strategy generation sandbox
├── packages/
│   ├── db/                # Prisma schema & client singleton
│   ├── market-data/       # Uniswap v3 subgraph + on-chain pool data
│   ├── port-utils/        # Auto port fallback utility
│   ├── scoring-engine/    # Composite pool scoring
│   ├── risk-engine/       # Veto checks & risk scoring
│   ├── policy-engine/     # Hard constraint enforcement
│   ├── execution-engine/  # Tx build & submit (dry_run/live)
│   ├── strategy-engine/   # Strategy registry & lifecycle
│   ├── allocation-engine/ # Capital allocation
│   ├── llm-gateway/       # Unified LLM interface (sandbox only)
│   └── ...
├── scripts/
│   └── setup.sh           # One-command project setup
├── Makefile               # Dev shortcuts
├── docker-compose.yml     # Postgres + Redis + service containers
└── .env.example           # Environment variable reference
```

## Worker Job Schedule

| Job | Schedule | Description |
|-----|----------|-------------|
| `ingest` | Every 5 min | Fetch pool market data, upsert snapshots |
| `score` | Every 15 min | Risk assessment + composite pool scoring |
| `decide` | Every 30 min | Strategy decisions + approval record creation |
| `execute` | Every 60 sec | Execute approved decisions (live gate) |

## API Endpoints

```
GET /health              # Service health + dry-run flag
GET /health/services     # Per-service heartbeats
GET /pools               # Pool universe (?active=true/false)
GET /pools/:address      # Single pool with snapshots & positions
GET /scores              # Latest composite scores
GET /positions           # Positions (?status=open/closed)
GET /decisions           # Rebalance decisions (?status=pending/approved)
GET /approvals           # Approval records
GET /audit               # Immutable audit log
```

## Implementation Phases

- [x] **Phase 1** — Foundation: monorepo, DB, v3 adapter, market ingest, risk engine, dry-run, Telegram
- [x] **Phase 2** — Decision core: scoring engine, allocator, strategy registry, approvals, policy engine, execution  ← **Sprint 2 complete**
- [ ]   - Testing infrastructure: Vitest configuration with monorepo path aliases
- [ ]     - CI/CD workflows: GitHub Actions for lint, typecheck, build, test with coverage reporting
- [ ]   - Unit test samples: Initial test suite for @ratio/db packageengine
- [ ] **Phase 3** — Live execution: gas engine, hot wallet ops, staged live validation, rollback logic
- [ ] **Phase 4** — LLM lab: narrative engine, strategy-lab, constrained proposals, candidate promotion
- [ ] **Phase 5** — v4 expansion: v4 discovery, hook classifier, v4 simulation, restricted live allowlist

## Security

- `EXECUTION_MODE=dry_run` is the default. Live execution requires explicit opt-in via policy + human Telegram approval.
- LLM may never sign transactions, override risk vetoes, or self-promote strategies.
- All approval actions are logged immutably in `AuditEvent`.
- Two-step confirmation required for actions above capital threshold.
- Wallet private key is loaded at runtime only — never stored in git or logs.

## License

Private — all rights reserved.
