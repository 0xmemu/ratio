import { describe, it, expect } from 'vitest';
import { GasEstimator } from './gas';

describe('GasEstimator', () => {
  it('should initialize correctly', () => {
    const estimator = new GasEstimator({
      rpcUrl: 'http://localhost:8545',
      maxGasPriceGwei: 50,
      maxPriorityFeeGwei: 2,
      ethPriceUsd: 3000,
    });

    expect(estimator).toBeDefined();
  });

  it('should expose gas price method', () => {
    const estimator = new GasEstimator({
      rpcUrl: 'http://localhost:8545',
      maxGasPriceGwei: 50,
      maxPriorityFeeGwei: 2,
      ethPriceUsd: 3000,
    });

    expect(typeof estimator.getCurrentGasPriceGwei).toBe('function');
  });
});
