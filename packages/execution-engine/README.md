# Execution Engine

Phase 3 live transaction execution engine for the Ratio LP automation system.

## Overview

The Execution Engine handles production-ready transaction execution with comprehensive safety mechanisms:

- **Gas Estimation**: Real-time gas price monitoring and optimization
- **Wallet Management**: Secure hot wallet operations with non-interactive signing
- **Validation Pipeline**: Multi-stage validation including simulation and safety checks
- **Rollback Logic**: Automated failure detection and position recovery
- **Position Execution**: Uniswap v3 liquidity position lifecycle management

## Architecture

```
src/
├── gas/                    # Gas estimation and optimization
│   ├── GasEstimator.ts     # EIP-1559 gas price fetching and budgeting
│   ├── types.ts            # Gas-related type definitions
│   └── index.ts            # Module exports
├── wallet/                 # Hot wallet operations
│   ├── WalletManager.ts    # Transaction signing and broadcasting
│   ├── types.ts            # Wallet-related type definitions
│   └── index.ts            # Module exports
├── validation/             # Multi-stage validation
│   ├── ValidationPipeline.ts  # Pre-execution, simulation, safety checks
│   ├── types.ts            # Validation-related type definitions
│   └── index.ts            # Module exports
├── rollback/               # Failure handling and recovery
│   ├── RollbackManager.ts  # Retry logic and position closure
│   ├── types.ts            # Rollback-related type definitions
│   └── index.ts            # Module exports
├── position/               # Uniswap v3 position management
│   ├── PositionExecutor.ts # Mint, burn, collect, rebalance operations
│   ├── types.ts            # Position-related type definitions
│   └── index.ts            # Module exports
└── index.ts                # Main execution engine exports
```

## Modules

### Gas Estimator

Handles real-time gas price estimation and cost optimization:

```typescript
import { GasEstimator } from '@ratio/execution-engine';

const gasEstimator = new GasEstimator(provider, {
  maxGasPrice: 100n * 10n ** 9n, // 100 gwei maximum
  gasLimitBuffer: 1.2,            // 20% buffer for gas limit
});

const estimation = await gasEstimator.estimate(transaction);
const isAffordable = gasEstimator.validateGasBudget(estimation);
```

### Wallet Manager

Manages hot wallet operations with security best practices:

```typescript
import { WalletManager } from '@ratio/execution-engine';

const walletManager = new WalletManager(provider, {
  privateKeyEnv: 'WALLET_PRIVATE_KEY',
  minBalance: 10n ** 17n, // 0.1 ETH minimum
});

await walletManager.loadWallet();
const txResponse = await walletManager.sendTransaction(tx);
```

### Validation Pipeline

Multi-stage validation before transaction execution:

```typescript
import { ValidationPipeline } from '@ratio/execution-engine';

const pipeline = new ValidationPipeline({
  maxSlippage: 0.05,              // 5% maximum slippage
  maxPositionSize: 10n ** 18n,    // 1 ETH maximum
  minGasBalance: 10n ** 17n,      // 0.1 ETH minimum
});

const preCheck = await pipeline.validatePreExecution();
const simulation = await pipeline.simulateTransaction();
const safety = await pipeline.validateSafetyLimits();
```

### Rollback Manager

Handles transaction failures and position recovery:

```typescript
import { RollbackManager } from '@ratio/execution-engine';

const rollbackManager = new RollbackManager({
  maxRetries: 3,
  backoffMultiplier: 2,
  initialDelay: 1000,
});

await rollbackManager.rollbackPosition(positionId, 'gas_spike');
```

### Position Executor

Manages Uniswap v3 liquidity positions:

```typescript
import { PositionExecutor } from '@ratio/execution-engine';

const positionExecutor = new PositionExecutor(provider, {
  slippageTolerance: 0.005,  // 0.5% slippage
  deadlineMinutes: 20,
});

const positionId = await positionExecutor.openPosition({
  token0: '0x...',
  token1: '0x...',
  amount0: 10n ** 18n,
  amount1: 10n ** 18n,
  tickLower: -887272,
  tickUpper: 887272,
});

await positionExecutor.closePosition(positionId);
```

## Security

**Critical Security Requirements:**

- Private keys MUST be stored in environment variables, never committed to code
- Wallets should maintain minimal balances (just enough for gas)
- All transactions undergo multi-stage validation before execution
- Manual approval gates for high-value transactions
- Automatic rollback on failure detection

## Testing

Run unit tests for individual modules:

```bash
pnpm test src/gas/GasEstimator.spec.ts
pnpm test src/wallet/WalletManager.spec.ts
pnpm test src/validation/ValidationPipeline.spec.ts
pnpm test src/rollback/RollbackManager.spec.ts
pnpm test src/position/PositionExecutor.spec.ts
```

Run integration tests:

```bash
pnpm test src/execution-engine.integration.spec.ts
```

## Development

Build the package:

```bash
pnpm build
```

Lint the code:

```bash
pnpm lint
```

## License

See the main project LICENSE file.
