# Phase 4 — Mainnet Readiness Checklist

Complete all items below before switching `EXECUTION_MODE=live` on mainnet.

---

## 1. Security

- [ ] Private key is stored in **HashiCorp Vault** or equivalent secret manager — never in `.env` on disk
- [ ] `TELEGRAM_ALLOWED_IDS` contains only known operator chat IDs
- [ ] API server (`/metrics`, `/health`) is behind firewall / VPN — not public-facing
- [ ] Prometheus scrape IP is allowlisted in firewall rules
- [ ] Docker containers run as non-root user (`USER node`)
- [ ] Secrets are injected via Docker secrets or env at runtime — not baked into image
- [ ] `pnpm audit` shows 0 high/critical vulnerabilities
- [ ] `git log` contains no committed secrets (run `trufflesec` or `gitleaks` scan)

---

## 2. Infrastructure

- [ ] VPS / cloud instance: minimum 4 vCPU, 8 GB RAM, 80 GB SSD
- [ ] PostgreSQL: production instance (RDS / Supabase / self-hosted with daily backups)
- [ ] Redis: production instance with persistence enabled (AOF)
- [ ] Prometheus + Grafana deployed and scraping `/metrics`
- [ ] Grafana dashboard imported: panels for open positions, decision flow, service health
- [ ] Alertmanager configured: PagerDuty / Telegram / email for critical alerts
- [ ] Log aggregation: Loki + Grafana or ELK — all service stdout piped
- [ ] Uptime monitoring: UptimeRobot / BetterStack on `/health`

---

## 3. Execution Engine

- [ ] `EXECUTION_MODE=live` tested end-to-end on **Sepolia** first (`scripts/sepolia-e2e.ts`)
- [ ] `ValidationPipeline` max position size set to a safe value for initial mainnet run
- [ ] `RollbackManager` auto-pause threshold reviewed (default: 3 failures)
- [ ] `GasEstimator` gas ceiling set to a conservative value (e.g. 200 gwei)
- [ ] Wallet has sufficient ETH for at least 20 tx at max gas ceiling
- [ ] `TelegramFailureNotifier` confirmed working: send a test alert
- [ ] `MetricsCollector` confirmed scraping: check Grafana dashboard

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

- [ ] All Prisma migrations applied on production DB (`pnpm --filter @ratio/db migrate deploy`)
- [ ] `AuditEvent` table is writable by all services
- [ ] `ServiceHeartbeat` table is being updated by worker and api
- [ ] DB connection pool limits set appropriately (PgBouncer recommended for production)
- [ ] Point-in-time recovery enabled on DB

---

## 6. Runbook

- [ ] Runbook written: how to pause, resume, rollback a failed execution
- [ ] On-call schedule defined
- [ ] Incident response template created (who to notify, what to check first)
- [ ] `make restart-worker` and `make restart-api` tested on production host

---

## 7. Go/No-Go Decision

| Item | Owner | Status |
|------|-------|--------|
| Security review | Security | ⬜ |
| Sepolia E2E test | Dev | ⬜ |
| Grafana dashboard live | DevOps | ⬜ |
| Ops bot confirmed | Ops | ⬜ |
| DB backup verified | DevOps | ⬜ |
| Runbook complete | Dev | ⬜ |

**All items must be ✅ before flipping to `EXECUTION_MODE=live` on mainnet.**

---

_Last updated: 2026-05-26_
