# Sentry Integration

## Install

pnpm add @sentry/node

## Environment

SENTRY_DSN=replace_me

## Recommended Captures

- execution failures
- rollback triggers
- RPC outages
- validation exceptions
- unhandled promise rejections

## Production Rules

- Enable release tracking
- Enable source maps
- Enable environment separation
- Tag all transaction hashes
