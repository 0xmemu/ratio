# Incident Response

## Severity Levels

### SEV-1
- wallet compromise
- massive execution failure
- unauthorized execution

### SEV-2
- RPC instability
- elevated failure rates
- rollback instability

### SEV-3
- degraded latency
- alert noise
- partial monitoring loss

## Immediate Actions

1. pause execution
2. verify wallet balances
3. verify infrastructure health
4. review logs
5. review rollback state

## Recovery

- rotate credentials if needed
- restore infrastructure
- validate execution safety
- resume staged execution
