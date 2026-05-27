#!/usr/bin/env bash
# =============================================================================
# git-secrets-check.sh — scan repo for accidentally committed secrets
# Uses gitleaks (auto-downloads if missing).
# Usage: bash scripts/git-secrets-check.sh
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${YELLOW}[secrets-check]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
die()  { echo -e "${RED}[fail]${NC} $*" >&2; exit 1; }

# Auto-install gitleaks if not present
if ! command -v gitleaks &>/dev/null; then
  log "gitleaks not found — installing..."
  GITLEAKS_VERSION="8.23.0"
  GITLEAKS_URL="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_amd64.tar.gz"
  curl -fsSL "$GITLEAKS_URL" -o /tmp/gitleaks.tar.gz
  tar -xzf /tmp/gitleaks.tar.gz -C /tmp
  sudo mv /tmp/gitleaks /usr/local/bin/gitleaks 2>/dev/null || mv /tmp/gitleaks /usr/local/bin/gitleaks 2>/dev/null || {
    log "Cannot install to /usr/local/bin — using /tmp/gitleaks directly"
    export PATH="/tmp:$PATH"
  }
  rm /tmp/gitleaks.tar.gz
  ok "gitleaks installed"
fi

log "Scanning git history for secrets..."

# Run gitleaks detect on the full git history
gitleaks detect --source=. --verbose --redact 2>&1 | tee /tmp/ratio-secrets-scan.log

FOUND=$(grep -c "leaks found" /tmp/ratio-secrets-scan.log 2>/dev/null || echo 0)

if [ "$FOUND" -gt 0 ]; then
  die "SECRETS DETECTED! Review the scan log above and remove leaked secrets before deploying."
else
  ok "No secrets found in git history."
fi

# Also check for common patterns not caught by gitleaks
log "Additional pattern checks..."

# Check for private keys in any file (not .env.example)
if git grep -l "0x[a-fA-F0-9]\{64\}" -- ':!.env.example' ':!*.md' ':!node_modules' ':!.git' 2>/dev/null; then
  die "Hex strings matching private key pattern found. Remove before deploying."
fi

# Check for potential API keys in source
if git grep -lE '[a-zA-Z0-9_-]{20,}="[a-zA-Z0-9_/-]{30,}"' -- '*.ts' '*.js' ':!node_modules' ':!*.spec.ts' ':!*.test.ts' 2>/dev/null; then
  warn "Potential hardcoded API keys found in source files (above). Review manually."
fi

ok "Secrets check complete."
