import { describe, it, expect } from 'vitest';
import { ValidationPipeline } from './validation';

describe('ValidationPipeline', () => {
  it('should initialize pipeline', () => {
    const pipeline = new ValidationPipeline({
      rpcUrl: 'http://localhost:8545',
      maxGasPriceGwei: 50,
      minimumBalanceEth: 0.01,
    });

    expect(pipeline).toBeDefined();
  });
});
