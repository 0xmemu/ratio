/**
 * ratio-strategy-lab
 * Research-only service where LLMs propose strategy variants inside a constrained schema
 * This is the ONLY place where strategy mutation and generation are allowed
 * LLM may create draft only - may never directly change lifecycle state
 */
import { runStrategyLab } from './lab.js';

console.log('[ratio-strategy-lab] starting in research mode...');
console.log('[ratio-strategy-lab] LLM strategy generation is sandboxed - drafts only');
await runStrategyLab();
