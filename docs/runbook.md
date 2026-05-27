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

---

## 7. Phase 4 — LLM Lab Operations

The LLM Lab runs advisory analysis on top-scored pools. It never executes transactions.

```bash
# Check LLM analysis results
curl http://localhost:3000/llm/insights?limit=10

# Check RL weights (strategy optimization)
curl http://localhost:3000/llm/rl-weights

# Check vector memory size (strategy embeddings)
curl http://localhost:3000/llm/memory-stats

# Force a manual LLM analysis run
curl -X POST http://localhost:3000/llm/analyze
```

### LLM Lab Pipeline

```
MarketAnalyzer → StrategyAgent → Backtester → SimulationLab → RiskAgent → DecisionEngine
                                                                              ↓
                                VectorMemory ← PerformanceRecall ← ReinforcementEngine
```

### Interpreting LLM Output

- `confidence >= 70` → strong signal, likely worth considering
- `confidence 40–69` → moderate, review market conditions manually
- `confidence < 40` → weak signal, skip
- `riskLevel = critical` → ALWAYS vetoed regardless of other signals

---

## 8. Phase 5 — v4 Operations

Uniswap v4 pools are in DISCOVERY MODE by default. No v4 transactions are executed without explicit allowlisting.

```bash
# Check v4 discovery results
curl http://localhost:3000/v4/pools?limit=20

# Check hook classifications
curl http://localhost:3000/v4/hooks

# Check allowlist status
curl http://localhost:3000/v4/allowlist

# Simulate a v4 position (dry-run only)
curl -X POST http://localhost:3000/v4/simulate -H 'Content-Type: application/json' \
  -d '{"poolId":"0x...","capitalUsd":5000,"holdingPeriodDays":30}'
```

### V4 Hook Risk Levels

| Risk Score | Trust Level | Action |
|-----------|-------------|--------|
| 0.0–0.2 | allowlisted | safe for restricted live |
| 0.2–0.4 | audited | simulation only |
| 0.4–0.7 | analyzed | monitor, no execution |
| 0.7–1.0 | unknown | avoid entirely |

### Adding a v4 Pool to Allowlist

1. Pool must pass HookClassifier with risk < 0.3
2. Pool must have > $250k TVL and > $50k daily volume
3. Manual review by operator
4. Add via `V4Allowlist.allowPool(poolId)`

---

## 9. Incident Response

### Severity Levels

| Level | Definition | Response Time | Notification |
|-------|-----------|---------------|--------------|
| **P0 — Critical** | Wallet at risk, funds being drained, unauthorized tx | Immediate | Telegram + call |
| **P1 — High** | Execution failures piling up, auto-pause triggered | < 15 min | Telegram |
| **P2 — Medium** | Gas spike above ceiling, single position stuck | < 1 hour | Telegram |
| **P3 — Low** | LLM anomaly, v4 discovery stall, metrics gap | < 4 hours | Slack/email |

### P0 — Critical Response

1. **Stop worker immediately:**
   ```bash
   docker compose -f docker-compose.production.yml stop worker
   # OR: kill -SIGTERM <worker_pid>
   ```

2. **Check audit log for unauthorized actions:**
   ```bash
   curl http://localhost:3000/audit?limit=100 | python3 -m json.tool
   ```

3. **If wallet is compromised:**
   - Transfer remaining funds to cold wallet via Etherscan/MEV blocker
   - Revoke all token approvals at https://revoke.cash

4. **Post-incident:**
   - Rotate `WALLET_PRIVATE_KEY`
   - Review and update validation rules
   - File incident report in `docs/incidents/YYYY-MM-DD.md`

### P1 — High Response

1. Check failure reason:
   ```bash
   docker compose -f docker-compose.production.yml logs worker --tail=100
   ```

2. Common causes:
   - RPC endpoint throttled → switch fallback RPC
   - Gas too high → increase gas ceiling or wait
   - Insufficient balance → refill wallet
   - Pool illiquid → skip pool, resume worker

3. Resume after fix:
   ```bash
   curl -X POST http://localhost:3000/admin/resume
   ```

---

## 10. Production Deployment

### Full Deployment (first time or major update)

```bash
bash scripts/production-deploy.sh
```

### Pre-flight Check Only (no deploy)

```bash
bash scripts/production-deploy.sh --check
```

### Restart Services Only

```bash
bash scripts/production-deploy.sh --restart
```

### View Logs

```bash
# All services
docker compose -f docker-compose.production.yml logs -f

# Specific service
docker compose -f docker-compose.production.yml logs -f worker
```

### DB Backup

```bash
docker compose -f docker-compose.production.yml exec postgres \
  pg_dump -U ratio ratio > backups/ratio_$(date +%Y%m%d_%H%M%S).sql
```

### Applying Migrations

```bash
docker compose -f docker-compose.production.yml run --rm api \
  sh -c "pnpm --filter @ratio/db exec prisma migrate deploy"
```

---

## 11. Maintenance Windows

| Task | Frequency | Command |
|------|-----------|---------|
| DB backup | Daily | `bash scripts/backup-db.sh` (create if missing) |
| Secrets scan | Weekly | `bash scripts/git-secrets-check.sh` |
| Dependency audit | Weekly | `pnpm audit` |
| Log rotation check | Monthly | `du -sh /var/lib/docker/containers/*/*.log` |
| Grafana dashboard review | Monthly | Check http://localhost:3001 for stale panels |
| Sepolia E2E test | Before each live deployment | `pnpm --filter @ratio/execution-engine exec ts-node scripts/sepolia-e2e.ts` |