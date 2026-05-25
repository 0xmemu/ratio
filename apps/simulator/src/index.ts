/**
 * ratio-simulator
 * Dry-run learning and historical replay simulation engine
 * Estimates: net fee outcome, rebalance frequency, IL pressure, swap costs, gas burden
 */
import { runSimulator } from './simulator.js';

console.log('[ratio-simulator] starting...');
await runSimulator();
