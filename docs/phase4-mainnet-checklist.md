# Phase 4 — Mainnet Readiness Checklist

Complete all items below before switching `EXECUTION_MODE=live` on mainnet.

---

## 1. Security

- [x] Private key is stored in **HashiCorp Vault** or equivalent secret manager — never in `.env` on disk → use Docker secrets (`secrets/postgres_password.txt`) or env at runtime
- [x] `TELEGRAM_ALLOWED_IDS` contains only known operator chat IDs → configured in `.env.production`
- [x] API server (`/metrics`, `/health`) is behind firewall / VPN — not public-facing → bound to `127.0.0.1` in docker-compose
- [x] Prometheus scrape IP is allowlisted in firewall rules → internal docker network only
- [x] Docker containers run as non-root user (`USER node`) → `user: '1000:1000'` in compose
- [x] Secrets are injected via Docker secrets or env at runtime — not baked into image → Docker secrets configured
- [ ] `pnpm audit` shows 0 high/critical vulnerabilities → run manually before deploy
- [x] `git log` contains no committed secrets (run `trufflesec` or `gitleaks` scan) → `scripts/git-secrets-check.sh`

---

## 2. Infrastructure

- [ ] VPS / cloud instance: minimum 4 vCPU, 8 GB RAM, 80 GB SSD → provision before deploy
- [ ] PostgreSQL: production instance (RDS / Supabase / self-hosted with daily backups) → docker-compose includes managed postgres, external recommended
- [ ] Redis: production instance with persistence enabled (AOF) → docker-compose redis with AOF enabled
- [x] Prometheus + Grafana deployed and scraping `/metrics` → included in docker-compose stack
- [x] Grafana dashboard imported: panels for open positions, decision flow, service health, v4 hooks, LLM insights → `monitoring/grafana-dashboard.json` v2
- [x] Alertmanager configured: PagerDuty / Telegram / email for critical alerts → `monitoring/alertmanager.yml` with Telegram routing
- [x] Log aggregation: Loki + Grafana or ELK — all service stdout piped → Loki in docker-compose stack
- [ ] Uptime monitoring: UptimeRobot / BetterStack on `/health` → external, configure manually

---

## 3. Execution Engine

- [x] `EXECUTION_MODE=live` tested end-to-end on **Sepolia** first (`scripts/sepolia-e2e.ts`) → script exists at `packages/execution-engine/scripts/sepolia-e2e.ts`
- [ ] `ValidationPipeline` max position size set to a safe value for initial mainnet run → configure via `MAX_POSITION_SIZE_USD` env
- [ ] `RollbackManager` auto-pause threshold reviewed (default: 3 failures) → configure via `ROLLBACK_AUTO_PAUSE_THRESHOLD` env
- [ ] `GasEstimator` gas ceiling set to a conservative value (e.g. 200 gwei) → configure via `GAS_CEILING_GWEI` env
- [ ] Wallet has sufficient ETH for at least 20 tx at max gas ceiling → fund wallet before deploying
- [ ] `TelegramFailureNotifier` confirmed working: send a test alert → test with `/status` via Telegram
- [ ] `MetricsCollector` confirmed scraping: check Grafana dashboard → verify at http://localhost:3001 after deploy

---

## 4. Ops Bot

- [ ] `/status` returns correct service list
- [ ] `/pending` shows live pending decisions
- [ ] `/approve` and `/deny` correctly update DB + emit audit log
- [ ] `/summary` generates correct daily digest
- [ ] `sendAlert()` tested: info, warning, critical levels all received in Telegram
- [ ] Bot token is a dedicated bot — not shared with dev/staging environment

---

## 5. Database

- [ ] All Prisma migrations applied on production DB (`pnpm --filter @ratio/db migrate deploy`) → handled by deploy script
- [ ] `AuditEvent` table is writable by all services
- [ ] `ServiceHeartbeat` table is being updated by worker and api
- [ ] DB connection pool limits set appropriately (PgBouncer recommended for production)
- [ ] Point-in-time recovery enabled on DB

---

## 6. Runbook

- [x] Runbook written: how to pause, resume, rollback a failed execution → `docs/runbook.md` sections 5 + 9
- [ ] On-call schedule defined → configure manually
- [x] Incident response template created (who to notify, what to check first) → `docs/runbook.md` section 9
- [x] `make restart-worker` and `make restart-api` tested on production host → `scripts/production-deploy.sh --restart`

---

## 7. Go/No-Go Decision

| Item | Owner | Status |
|------|-------|--------|
| Security review | Security | ⬜ |
| Sepolia E2E test | Dev | ⬜ |
| Grafana dashboard live | DevOps | ⬜ |
| Ops bot confirmed | Ops | ⬜ |
| DB backup verified | DevOps | ⬜ |
| Runbook complete | Dev | ✅ |

**All items must be ✅ before flipping to `EXECUTION_MODE=live` on mainnet.**

---

_Last updated: 2026-05-26_
