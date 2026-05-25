# =============================================================================
# Makefile - Ratio project command shortcuts
# Usage: make <target>
# =============================================================================
.PHONY: help setup install build dev clean\
        db-generate db-migrate db-studio db-reset\
        infra-up infra-down infra-logs\
        start-api start-worker start-bot\
        lint test logs

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ---- Setup ------------------------------------------------------------------
setup: ## Full first-time setup (install, infra, migrate, build)
	bash scripts/setup.sh

install: ## Install pnpm dependencies
	pnpm install

build: ## Build all packages and apps
	pnpm build

dev: ## Start all services in dev/watch mode
	pnpm dev

clean: ## Remove all build artifacts and node_modules
	find . -name 'node_modules' -type d -prune -exec rm -rf {} +
	find . -name 'dist' -type d -prune -exec rm -rf {} +
	find . -name '*.tsbuildinfo' -delete

# ---- Database ---------------------------------------------------------------
db-generate: ## Generate Prisma client
	pnpm --filter @ratio/db exec prisma generate

db-migrate: ## Apply pending Prisma migrations
	pnpm --filter @ratio/db exec prisma migrate deploy

db-migrate-dev: ## Create + apply new migration (dev only)
	pnpm --filter @ratio/db exec prisma migrate dev

db-studio: ## Open Prisma Studio (browser DB UI)
	pnpm --filter @ratio/db exec prisma studio

db-reset: ## Reset database (DESTRUCTIVE - deletes all data)
	@echo "WARNING: This will delete ALL data. Press Ctrl+C to cancel."
	@sleep 3
	pnpm --filter @ratio/db exec prisma migrate reset --force

# ---- Infrastructure ---------------------------------------------------------
infra-up: ## Start postgres + redis via docker-compose
	docker compose up -d postgres redis

infra-down: ## Stop all docker-compose services
	docker compose down

infra-logs: ## Follow logs from all containers
	docker compose logs -f

infra-ps: ## Show running containers
	docker compose ps

# ---- Services ---------------------------------------------------------------
start-api: ## Start the REST API (port from APP_PORT, default 3000)
	pnpm --filter @ratio/api start

start-worker: ## Start the background cron worker
	pnpm --filter @ratio/worker start

start-bot: ## Start the Telegram ops bot
	pnpm --filter @ratio/ops-bot start

# ---- Quality ----------------------------------------------------------------
lint: ## Run ESLint across all packages
	pnpm lint

test: ## Run all tests
	pnpm test

# ---- Logs & Health ----------------------------------------------------------
health: ## Check API health endpoint
	curl -s http://localhost:$${APP_PORT:-3000}/health | python3 -m json.tool

scores: ## Show latest pool scores from API
	curl -s http://localhost:$${APP_PORT:-3000}/scores | python3 -m json.tool

pending: ## Show pending decisions from API
	curl -s http://localhost:$${APP_PORT:-3000}/decisions?status=pending | python3 -m json.tool

positions: ## Show open positions from API
	curl -s http://localhost:$${APP_PORT:-3000}/positions?status=open | python3 -m json.tool
