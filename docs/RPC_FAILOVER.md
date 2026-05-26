# RPC Failover Strategy

## Primary Providers

Recommended:
- Infura
- Alchemy
- QuickNode

## Failover Logic

1. Detect timeout/errors
2. Retry request
3. Switch provider
4. Log provider degradation

## Monitoring

Track:
- latency
- error rates
- rate limits
- disconnect frequency

## Recovery

- automatically restore primary provider
- validate state consistency
