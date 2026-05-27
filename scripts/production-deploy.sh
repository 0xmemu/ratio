#!/usr/bin/env bash
# =============================================================================
# production-deploy.sh — one-command production deployment for Ratio
# Usage: bash scripts/production-deploy.sh [--check] [--restart]
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
die()  { echo -e "${RED}[fail]${NC} $*" >&2; exit 1; }

CHECK_ONLY=false
RESTART_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK_ONLY=true; shift ;;
    --restart) RESTART_ONLY=true; shift ;;
    *) die "Unknown flag: $1" ;;
  esac
done

# ── Pre-flight checks ─────────────────────────────────────────
log "Pre-flight checks..."

if [ ! -f .env.production ]; then
  die ".env.production not found. Copy from .env.production.example and fill in values."
fi

# Source .env.production to check required vars
set -a
source .env.production
set +a

REQUIRED=(
  DATABASE_URL ETH_RPC_URL WALLET_PRIVATE_KEY
  TELEGRAM_BOT_TOKEN TELEGRAM_ALLOWED_IDS
)
for var in "${REQUIRED[@]}"; do
  val="${!var:-}"
  if [[ -z "$val" || "$val" == *"replace"* || "$val" == *"0000000000"* ]]; then
    die "Required env var $var is not set or is still a placeholder."
  fi
done

# Check secrets directory
mkdir -p secrets
if [ ! -f secrets/postgres_password.txt ]; then
  openssl rand -hex 32 > secrets/postgres_password.txt
  ok "Generated postgres_password secret"
fi
if [ ! -f secrets/grafana_password.txt ]; then
  openssl rand -hex 16 > secrets/grafana_password.txt
  ok "Generated grafana_password secret"
fi

# Check Docker
command -v docker >/dev/null 2>&1 || die "Docker not found."
docker compose version >/dev/null 2>&1 || die "Docker Compose not found."

# ── Secrets scan ──────────────────────────────────────────────
if [ "$RESTART_ONLY" = false ]; then
  log "Running secrets scan..."
  bash scripts/git-secrets-check.sh || warn "Secrets scan found issues — review before deploying."
fi

# ── Check-only mode ───────────────────────────────────────────
if [ "$CHECK_ONLY" = true ]; then
  ok "All pre-flight checks passed."
  log "EXECUTION_MODE=${EXECUTION_MODE:-dry_run}"
  log "Wallet: ${WALLET_ADDRESS:-not set}"
  exit 0
fi

# ── Restart-only mode ─────────────────────────────────────────
if [ "$RESTART_ONLY" = true ]; then
  log "Restarting services..."
  docker compose -f docker-compose.production.yml restart api worker ops-bot
  ok "Services restarted."
  exit 0
fi

# ── Full deployment ───────────────────────────────────────────
log "Starting full production deployment..."

if [ "${EXECUTION_MODE:-dry_run}" = "live" ]; then
  echo ""
  warn "=============================================================="
  warn "  LIVE MODE DETECTED"
  warn "  Real transactions will be sent on Ethereum mainnet."
  warn "  Wallet: ${WALLET_ADDRESS:-unknown}"
  warn "=============================================================="
  echo ""
  read -rp "Type 'LIVE' to confirm: " confirm
  if [ "$confirm" != "LIVE" ]; then
    die "Confirmation failed. Aborting."
  fi
fi

# Pull latest images
log "Pulling base images..."
docker compose -f docker-compose.production.yml pull postgres redis prometheus grafana alertmanager loki

# Build Ratio services
log "Building Ratio services..."
docker compose -f docker-compose.production.yml build --no-cache api worker ops-bot

# Start infrastructure first
log "Starting infrastructure..."
docker compose -f docker-compose.production.yml up -d postgres redis prometheus grafana loki
sleep 5

# Run DB migrations
log "Running database migrations..."
docker compose -f docker-compose.production.yml run --rm -T api sh -c "pnpm --filter @ratio/db exec prisma migrate deploy"

# Start Ratio services
log "Starting Ratio services..."
docker compose -f docker-compose.production.yml up -d api worker ops-bot alertmanager

# Wait for healthy
log "Waiting for services to be healthy (max 60s)..."
RETRIES=60
while [ $RETRIES -gt 0 ]; do
  HEALTHY=$(docker compose -f docker-compose.production.yml ps --format json | grep -c '"Health":"healthy"' || true)
  if [ "$HEALTHY" -ge 7 ]; then
    ok "All 7 services healthy!"
    break
  fi
  sleep 2
  RETRIES=$((RETRIES - 1))
done

if [ $RETRIES -eq 0 ]; then
  warn "Some services may not be healthy. Check: docker compose -f docker-compose.production.yml ps"
fi

# Final verification
log "Verifying deployment..."
sleep 3
curl -sf http://localhost:3000/health | python3 -m json.tool 2>/dev/null || warn "API health check failed"

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}  Ratio is live in ${EXECUTION_MODE:-dry_run} mode${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo "  API:         http://localhost:3000/health"
echo "  Grafana:     http://localhost:3001 (${GRAFANA_USER:-admin})"
echo "  Prometheus:  http://localhost:9090"
echo "  Alertmanager: http://localhost:9093"
echo ""
echo "  Monitor logs: docker compose -f docker-compose.production.yml logs -f"
echo "  Stop:         docker compose -f docker-compose.production.yml down"
echo ""
