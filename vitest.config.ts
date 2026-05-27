import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.turbo'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        '**/__tests__/**',
      ],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@ratio/db': path.resolve(__dirname, './packages/db/src'),
      '@ratio/market-data': path.resolve(__dirname, './packages/market-data/src'),
      '@ratio/scoring-engine': path.resolve(__dirname, './packages/scoring-engine/src'),
      '@ratio/risk-engine': path.resolve(__dirname, './packages/risk-engine/src'),
      '@ratio/policy-engine': path.resolve(__dirname, './packages/policy-engine/src'),
      '@ratio/execution-engine': path.resolve(__dirname, './packages/execution-engine/src'),
      '@ratio/strategy-engine': path.resolve(__dirname, './packages/strategy-engine/src'),
      '@ratio/allocation-engine': path.resolve(__dirname, './packages/allocation-engine/src'),
      '@ratio/backtest-core': path.resolve(__dirname, './packages/backtest-core/src'),
      '@ratio/llm-gateway': path.resolve(__dirname, './packages/llm-gateway/src'),
      '@ratio/llm-lab': path.resolve(__dirname, './packages/llm-lab/src'),
      '@ratio/protocol-v3': path.resolve(__dirname, './packages/protocol-v3/src'),
      '@ratio/port-utils': path.resolve(__dirname, './packages/port-utils/src'),
    },
  },
});
