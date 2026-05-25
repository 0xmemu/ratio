# Deployment Guide - Execution Engine

Deployment guide for Phase 3 Execution Engine to Sepolia testnet (Milestone 2).

## Prerequisites

Before deploying, ensure you have:

1. **Node.js** (>=18.0.0) and **pnpm** installed
2. **Testnet ETH** from Sepolia faucet:
   - https://sepoliafaucet.com/
   - https://www.alchemy.com/faucets/ethereum-sepolia
3. **RPC Access**: Infura or Alchemy API key
4. **Telegram Bot** (for approval workflow):
   - Create bot via @BotFather
   - Get bot token
   - Get your chat ID

## Environment Setup

### 1. Copy Configuration Template

```bash
cd packages/execution-engine
cp .env.sepolia .env
```

### 2. Configure Environment Variables

Edit `.env` and set the following critical values:

```bash
# RPC - Replace with your Infura/Alchemy key
RPC_URL=https://sepolia.infura.io/v3/YOUR_ACTUAL_PROJECT_ID

# Wallet - Use a dedicated testnet wallet
WALLET_PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY

# Telegram (for approval workflow)
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
TELEGRAM_APPROVAL_CHAT_ID=YOUR_CHAT_ID
```

**Security Notes:**
- ⚠️ Never use mainnet private keys
- ⚠️ Never commit `.env` to version control
- ⚠️ Use a fresh wallet for testnet only
- ⚠️ Limit testnet wallet balance to ~0.5 ETH

### 3. Verify Wallet Balance

Ensure your testnet wallet has sufficient ETH:

```bash
# Check balance (minimum 0.1 ETH recommended)
pnpm run check-balance
```

## Installation

### 1. Install Dependencies

```bash
# From project root
pnpm install

# Build packages
pnpm build
```

### 2. Run Tests

Verify everything works before deployment:

```bash
cd packages/execution-engine

# Run unit tests
pnpm test

# Run integration tests
pnpm test:integration

# Run with coverage
pnpm test:coverage
```

## Deployment Process

### Phase 1: Dry-Run Mode

Start with dry-run mode for safety:

```bash
# Set execution mode
export EXECUTION_MODE=dry_run

# Start the execution engine
pnpm start:testnet
```

**Dry-run mode:**
- Simulates all transactions
- No real blockchain interaction
- Validates gas estimation
- Tests approval workflow
- Safe for testing end-to-end flow

### Phase 2: Testnet Deployment

Once dry-run testing is successful:

```bash
# Enable live testnet execution
export EXECUTION_MODE=live

# Start with verbose logging
LOG_LEVEL=debug pnpm start:testnet
```

**Monitor these metrics:**
- Gas consumption
- Transaction success rate
- Approval workflow latency
- Rollback triggers
- Error patterns

## Testing Checklist

### Pre-Deployment Tests

- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Gas estimation works correctly
- [ ] Wallet loads and signs transactions
- [ ] Validation pipeline catches errors
- [ ] Rollback manager handles failures
- [ ] Telegram approval workflow functions

### Testnet Validation Tests

- [ ] Open a small liquidity position (<0.1 ETH)
- [ ] Monitor gas costs
- [ ] Test position closure
- [ ] Trigger rollback scenario
- [ ] Test high-value approval workflow
- [ ] Verify safety limits enforcement
- [ ] Test with network congestion

## Monitoring

### Logs

Monitor application logs for:

```bash
# Follow logs in real-time
tail -f logs/execution-engine.log

# Filter for errors
grep ERROR logs/execution-engine.log

# Monitor gas usage
grep "Gas used" logs/execution-engine.log
```

### Metrics

Metrics endpoint (if enabled):

```bash
curl http://localhost:9090/metrics
```

### Key Metrics to Monitor

- `execution_engine_transactions_total`
- `execution_engine_gas_used_total`
- `execution_engine_rollbacks_total`
- `execution_engine_approvals_pending`
- `execution_engine_errors_total`

## Troubleshooting

### Common Issues

#### 1. Insufficient Gas

**Symptom:** Transactions fail with "out of gas"

**Solution:**
```bash
# Increase gas limit buffer in .env
GAS_LIMIT_BUFFER=1.5  # Increase from 1.2 to 1.5
```

#### 2. Wallet Balance Too Low

**Symptom:** "Insufficient funds" error

**Solution:**
```bash
# Get more testnet ETH from faucet
# Or reduce MAX_DAILY_GAS_SPEND in .env
```

#### 3. RPC Rate Limiting

**Symptom:** "Too many requests" or 429 errors

**Solution:**
```bash
# Use fallback RPC endpoints
# Or upgrade to paid RPC plan
```

#### 4. Approval Timeout

**Symptom:** Transactions stuck pending approval

**Solution:**
```bash
# Increase timeout in .env
APPROVAL_TIMEOUT_SECONDS=7200  # Increase to 2 hours
```

## Rollback to Dry-Run

If issues occur, immediately switch back:

```bash
# Stop the service
pkill -f execution-engine

# Set to dry-run
export EXECUTION_MODE=dry_run

# Restart
pnpm start:testnet
```

## Production Migration

**DO NOT** migrate to mainnet until:

- [ ] All Milestone 2 tests pass
- [ ] Security audit complete (Milestone 4)
- [ ] Load testing complete (Milestone 4)
- [ ] Monitoring setup verified
- [ ] Runbooks documented
- [ ] Team approval obtained

## Support

For issues or questions:

1. Check logs: `logs/execution-engine.log`
2. Review error patterns
3. Consult `README.md` for module documentation
4. Raise issue on GitHub

## Next Steps

After successful testnet deployment:

1. Document findings and metrics
2. Update test cases based on real scenarios
3. Proceed to Milestone 3: Contract Integration
4. Prepare for security audit (Milestone 4)
