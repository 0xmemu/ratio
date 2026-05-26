#!/usr/bin/env bash
set -e

echo '[ratio] healthcheck started'

if ! command -v node >/dev/null 2>&1; then
  echo 'node missing'
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo 'pnpm missing'
  exit 1
fi

echo '[ratio] environment ok'
exit 0
