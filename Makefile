# Ratio — Makefile
# Usage: make <target>

.PHONY: install build test lint clean dev-up dev-down migrate seed logs

## ── Install ───────────────────────────────────────────────────────────────────
install:
	pnpm install

## ── Build ─────────────────────────────────────────────────────────────────────
build:
	pnpm turbo build

## ── Test ──────────────────────────────────────────────────────────────────────
test:
	pnpm turbo test

test-watch:
	pnpm turbo test -- --watch

## ── Lint ──────────────────────────────────────────────────────────────────────
lint:
	pnpm turbo lint

format:
	pnpm turbo format

## ── Database ──────────────────────────────────────────────────────────────────
migrate:
	pnpm --filter @ratio/db exec prisma migrate dev

migrate-deploy:
	pnpm --filter @ratio/db exec prisma migrate deploy

seed:
	pnpm --filter @ratio/db exec prisma db seed

studio:
	pnpm --filter @ratio/db exec prisma studio

## ── Docker dev ────────────────────────────────────────────────────────────────
dev-up:
	docker compose up -d

dev-down:
	docker compose down

dev-down-clean:
	docker compose down -v --remove-orphans

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f api

logs-worker:
	docker compose logs -f worker

logs-bot:
	docker compose logs -f ops-bot

## ── Restart individual services ───────────────────────────────────────────────
restart-api:
	docker compose restart api

restart-worker:
	docker compose restart worker

restart-bot:
	docker compose restart ops-bot

## ── E2E / Sepolia ─────────────────────────────────────────────────────────────
sepolia-dry:
	EXECUTION_MODE=dry-run pnpm --filter @ratio/execution-engine exec ts-node scripts/sepolia-e2e.ts

sepolia-live:
	EXECUTION_MODE=live pnpm --filter @ratio/execution-engine exec ts-node scripts/sepolia-e2e.ts

## ── Metrics ───────────────────────────────────────────────────────────────────
metrics:
	curl -s http://localhost:3000/metrics

health:
	curl -s http://localhost:3000/health | jq .

health-services:
	curl -s http://localhost:3000/health/services | jq .

## ── Clean ─────────────────────────────────────────────────────────────────────
clean:
	pnpm turbo clean
	rm -rf node_modules apps/*/node_modules packages/*/node_modules

## ── Help ──────────────────────────────────────────────────────────────────────
help:
	@echo "Ratio Makefile targets:"
	@echo "  install           Install all dependencies"
	@echo "  build             Build all packages"
	@echo "  test              Run all tests"
	@echo "  lint              Lint all packages"
	@echo "  migrate           Run Prisma migrations (dev)"
	@echo "  migrate-deploy    Run Prisma migrations (production)"
	@echo "  seed              Seed the database"
	@echo "  dev-up            Start Docker dev stack"
	@echo "  dev-down          Stop Docker dev stack"
	@echo "  logs              Follow all service logs"
	@echo "  restart-api       Restart API container"
	@echo "  restart-worker    Restart worker container"
	@echo "  restart-bot       Restart ops-bot container"
	@echo "  sepolia-dry       Run Sepolia E2E in dry-run mode"
	@echo "  sepolia-live      Run Sepolia E2E in live mode"
	@echo "  metrics           Fetch Prometheus metrics"
	@echo "  health            Fetch /health endpoint"
	@echo "  clean             Remove all build artifacts"
