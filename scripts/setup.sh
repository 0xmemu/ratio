#!/usr/bin/env bash
# =============================================================================
# setup.sh - Ratio project setup helper
# Run this once after cloning the repo to get everything ready.
# Usage: bash scripts/setup.sh
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[setup]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

log "Starting Ratio setup..."

# 1. Check required tools
log "Checking required tools..."
command -v node   >/dev/null 2>&1 || err "Node.js not found. Install Node.js >= 20"
command -v pnpm   >/dev/null 2>&1 || err "pnpm not found. Run: npm install -g pnpm"
command -v docker >/dev/null 2>&1 || warn "Docker not found. You will need to provide your own postgres/redis."

NODE_VERSION=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_VERSION" -lt 20 ]; then
  err "Node.js >= 20 required. Found v$(node --version)"
fi
ok "Node.js v$(node --version)"
ok "pnpm $(pnpm --version)"

# 2. Install dependencies
log "Installing pnpm dependencies..."
pnpm install
ok "Dependencies installed"

# 3. Copy .env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  ok ".env created from .env.example"
  warn "Edit .env and fill in your values before running!"
else
  warn ".env already exists - skipping copy"
fi

# 4. Start infra via docker-compose
if command -v docker >/dev/null 2>&1; then
  log "Starting postgres + redis via docker compose..."
  docker compose up -d postgres redis

  log "Waiting for postgres to be ready (max 30s)..."
  RETRIES=30
  until docker exec ratio-postgres pg_isready -U ratio -d ratio_db >/dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    [ "$RETRIES" -eq 0 ] && err "Postgres did not start in time."
    sleep 1
  done
  ok "Postgres ready"
else
  warn "Docker not available - skipping infra. Ensure DATABASE_URL + REDIS_URL are set in .env"
fi

# 5. Generate Prisma client
log "Generating Prisma client..."
pnpm --filter @ratio/db exec prisma generate
ok "Prisma client generated"

# 6. Run migrations
log "Running database migrations..."
pnpm --filter @ratio/db exec prisma migrate deploy
ok "Migrations applied"

# 7. Build all packages
log "Building all packages..."
pnpm build
ok "Build complete"

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}  Ratio is ready!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo "  Start all services in dev mode:"
echo "    pnpm dev"
echo ""
echo "  Or start individually:"
echo "    pnpm --filter @ratio/api start      # REST API on :3000"
echo "    pnpm --filter @ratio/worker start   # Background cron worker"
echo "    pnpm --filter @ratio/ops-bot start  # Telegram ops bot"
echo ""
echo "  API health: http://localhost:3000/health"
echo ""
