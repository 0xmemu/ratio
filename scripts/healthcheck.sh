#!/usr/bin/env bash
# =============================================================================
# healthcheck.sh — comprehensive multi-service health check for Ratio
# Usage: bash scripts/healthcheck.sh [--json]
# =============================================================================
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
TIMEOUT=5
JSON_OUT=false
[[ "${1:-}" == "--json" ]] && JSON_OUT=true

check() {
  local name="$1" url="$2" expected_code="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
  if [ "$code" = "$expected_code" ]; then
    if $JSON_OUT; then
      echo "{\"service\":\"$name\",\"url\":\"$url\",\"status\":\"healthy\",\"code\":$code}"
    else
      echo "  ✓ $name — $code"
    fi
    return 0
  else
    if $JSON_OUT; then
      echo "{\"service\":\"$name\",\"url\":\"$url\",\"status\":\"unhealthy\",\"code\":$code}"
    else
      echo "  ✗ $name — $code (expected $expected_code)"
    fi
    return 1
  fi
}

FAILS=0

if $JSON_OUT; then
  echo "["
else
  echo "[ratio] healthcheck — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""
fi

check "api-health"    "$API_URL/health"            "200" || ((FAILS++))
check "api-metrics"   "$API_URL/metrics"           "200" || ((FAILS++))
check "api-positions" "$API_URL/positions"         "200" || ((FAILS++))

if $JSON_OUT; then
  echo "]"
fi

echo ""
if [ "$FAILS" -eq 0 ]; then
  echo "[ratio] ✓ all checks passed"
  exit 0
else
  echo "[ratio] ✗ $FAILS check(s) failed"
  exit 1
fi
