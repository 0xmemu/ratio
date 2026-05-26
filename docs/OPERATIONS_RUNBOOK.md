# Operations Runbook

## Emergency Pause

Set:
EXECUTION_MODE=dry_run

Restart workers.

## Wallet Compromise

1. Stop execution
2. Rotate wallet
3. Rotate RPC credentials
4. Review audit logs

## RPC Failure

1. Switch provider
2. Restart workers
3. Validate balances

## Database Recovery

1. Restore latest backup
2. Run migrations
3. Validate integrity

## Gas Spike

1. Increase gas ceiling carefully
2. Or pause execution

## Rollback Trigger

1. Review failed tx
2. Retry if safe
3. Close position if needed
