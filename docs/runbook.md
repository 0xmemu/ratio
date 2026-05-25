# Ratio — Runbook

> Operational guide for running Ratio locally and going live.

## Prerequisites

- Node.js >= 18
- pnpm >= 8
- PostgreSQL (local or Docker)
- Redis (local or Docker)
- Alchemy/Infura API key (Ethereum mainnet)
- Telegram bot token + authorized chat ID

---

## 1. Local Setup

```bash
# Clone repo
git clone git@github.com:0xmemu/ratio.git
cd ratio

# Install dependencies
pnpm install

# Copy env template
cp .env.example .env
# Edit .env with your values (DATABASE_URL, REDIS_URL, ETH_RPC_URL, etc.)

# Start PostgreSQL + Redis via Docker
docker-compose up -d postgres redis

# Generate Prisma client
pnpm --filter @ratio/db exec prisma generate

# Run migrations
pnpm --filter @ratio/db exec prisma migrate dev

# (Optional) Seed test data
pnpm --filter @ratio/db exec prisma db seed
```

---

## 2. Run in DRY_RUN Mode (Default)

All three services run in parallel:

```bash
# Terminal 1: API
pnpm --filter @ratio/api start
# API listens on http://localhost:3000

# Terminal 2: Worker (cron: ingest/score/decide/execute)
pnpm --filter @ratio/worker start
# DRY_RUN=true by default — no on-chain transactions

# Terminal 3: Ops-bot (Telegram)
pnpm --filter @ratio/ops-bot start
```

Or all at once with Turbo:
```bash
pnpm dev
```

---

## 3. Verify DRY_RUN is Working

```bash
# Health check
curl http://localhost:3000/health
# Expected: { "status": "ok", "dryRun": true }

# Check latest decisions
curl http://localhost:3000/decisions?limit=5

# Check audit log
curl http://localhost:3000/audit?limit=10
```

Telegram: send `/status` to your ops-bot. Should show `DRY_RUN: true`.

---

## 4. Go-Live Checklist

> ⚠️  Complete ALL steps before enabling live mode. No shortcuts.

### Infrastructure
- [ ] PostgreSQL on production host (not local)
- [ ] Redis on production host
- [ ] Alchemy/Infura mainnet RPC with rate limit headroom
- [ ] All env vars set in production secret manager

### Wallet
- [ ] `WALLET_PRIVATE_KEY` loaded from secret manager (never git/clipboard)
- [ ] `WALLET_ADDRESS` set and funded with ETH for gas
- [ ] Gas wallet holds < $500 max at any time (hot wallet principle)
- [ ] Tested wallet address is correct with checksum

### Telegram Gate
- [ ] `TELEGRAM_BOT_TOKEN` set
- [ ] `TELEGRAM_ALLOWED_IDS` contains only your Telegram ID(s)
- [ ] Tested: send `/status` → get response
- [ ] Tested: send `/approve <test_id>` with invalid ID → get 'not found'
- [ ] Confirmed: bot cannot sign transactions

### Policy
- [ ] Review `packages/policy-engine/src/index.ts` — all limits correct
- [ ] Confirm gas ceiling: 50 gwei
- [ ] Confirm max single position: 20% of capital
- [ ] Confirm max drawdown: 2%
- [ ] Confirm min net profit: $5

### Final Activation

```bash
# Set in .env (production only):
EXECUTION_MODE=live
WALLET_PRIVATE_KEY=<from_secret_manager>
WALLET_ADDRESS=<your_hot_wallet>

# Restart worker
pnpm --filter @ratio/worker start
```

Worker will now:
1. Detect `EXECUTION_MODE=live`
2. Load wallet signer from `WALLET_PRIVATE_KEY`
3. For each approved decision: verify gas price < 50 gwei, submit tx, log `txHash`
4. Update `RebalanceDecision.status = 'executed'`
5. All actions logged to `AuditEvent` table

---

## 5. Emergency Stop

```bash
# Stop worker immediately
kill -SIGTERM <worker_pid>

# Or via Docker
docker stop ratio-worker

# Revoke live mode
# Set EXECUTION_MODE=dry_run in .env and restart
```

All in-flight decisions will remain `approved` status — they will be picked up on next restart.

---

## 6. Monitoring

```bash
# Service heartbeats
curl http://localhost:3000/health/services

# Recent audit events
curl http://localhost:3000/audit?limit=50

# Open positions
curl http://localhost:3000/positions

# Pending approvals
curl http://localhost:3000/approvals?status=pending
```

Telegram commands:
- `/status` — system health + DRY_RUN flag
- `/pending` — decisions awaiting approval
- `/positions` — open positions
- `/decisions` — last 10 decisions
- `/approve <id>` — approve a decision (live path)
- `/deny <id>` — deny a decision
