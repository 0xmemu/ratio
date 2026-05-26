# Chaos Testing

## RPC Failure Test

- simulate provider outage
- validate failover
- validate recovery

## Database Failure Test

- simulate DB disconnect
- validate retry handling
- validate recovery path

## Redis Failure Test

- simulate Redis restart
- validate queue recovery

## Gas Spike Test

- simulate abnormal gas conditions
- validate execution pause

## Rollback Test

- simulate execution failure
- validate rollback behavior
