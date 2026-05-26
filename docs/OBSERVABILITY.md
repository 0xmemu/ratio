# Observability Guide

## Metrics

Track:
- execution success rate
- execution latency
- gas usage
- wallet balances
- RPC latency
- rollback frequency

## Logs

Required logs:
- transaction hashes
- execution failures
- validation failures
- rollback triggers

## Alerting

Critical:
- repeated failures
- wallet depletion
- RPC outage
- abnormal gas spikes

## Dashboards

Recommended:
- Grafana
- Datadog
- Prometheus
