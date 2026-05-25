/**
 * @ratio/env
 * Centralized environment variable validation for all apps and packages.
 * Uses zod for strict type-safe parsing at startup.
 * Import this module FIRST in any app entrypoint.
 *
 * Usage:
 *   import { env } from '@ratio/db/env';
 *   // or at app level:
 *   import { validateEnv } from '@ratio/db/env';
 *   validateEnv(); // throws if any required var is missing
 */

// Inline zod-lite parser (avoids adding zod dep to @ratio/db if not already present)
// If zod is available as dep, replace with: import { z } from 'zod';

export interface RatioEnv {
  // Database
  DATABASE_URL: string;
  REDIS_URL: string;

  // Ethereum
  ETH_RPC_URL: string;
  ETH_CHAIN_ID: number;

  // Execution mode
  EXECUTION_MODE: 'dry_run' | 'live';
  NODE_ENV: 'development' | 'production' | 'test';

  // Telegram
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ALLOWED_IDS: string[];

  // LLM
  LLM_API_KEY: string | undefined;
  LLM_BASE_URL: string | undefined;

  // Wallet (live mode only — never log or expose)
  WALLET_PRIVATE_KEY: string | undefined;
  WALLET_ADDRESS: string | undefined;

  // Uniswap
  UNISWAP_V3_NFT_MANAGER: string;
  ETH_PRICE_USD: number;

  // App
  APP_PORT: number;
  APP_HOST: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Required vars for each mode.
 * Missing vars at startup = hard crash with clear error message.
 */
const REQUIRED_ALWAYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'ETH_RPC_URL',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ALLOWED_IDS',
] as const;

const REQUIRED_LIVE = [
  'WALLET_PRIVATE_KEY',
  'WALLET_ADDRESS',
] as const;

/**
 * Validate all required env vars.
 * Call at app startup before any other imports.
 * Throws a descriptive error if any required var is missing.
 */
export function validateEnv(): void {
  const missing: string[] = [];

  for (const key of REQUIRED_ALWAYS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  const isLive = process.env.EXECUTION_MODE === 'live';
  if (isLive) {
    for (const key of REQUIRED_LIVE) {
      if (!process.env[key]) {
        missing.push(`${key} (required for EXECUTION_MODE=live)`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[ratio] Missing required environment variables:\n` +
      missing.map(k => `  - ${k}`).join('\n') +
      `\n\nSee .env.example for reference.`
    );
  }
}

/**
 * Parsed and typed env object.
 * Only call after validateEnv() to ensure all vars are present.
 */
export function getEnv(): RatioEnv {
  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    REDIS_URL: process.env.REDIS_URL!,

    ETH_RPC_URL: process.env.ETH_RPC_URL!,
    ETH_CHAIN_ID: parseInt(process.env.ETH_CHAIN_ID ?? '1', 10),

    EXECUTION_MODE: (process.env.EXECUTION_MODE === 'live' ? 'live' : 'dry_run'),
    NODE_ENV: (process.env.NODE_ENV as RatioEnv['NODE_ENV']) ?? 'development',

    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN!,
    TELEGRAM_ALLOWED_IDS: (process.env.TELEGRAM_ALLOWED_IDS ?? '').split(',').filter(Boolean),

    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_BASE_URL: process.env.LLM_BASE_URL,

    // SECURITY: never log or expose WALLET_PRIVATE_KEY
    WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY,
    WALLET_ADDRESS: process.env.WALLET_ADDRESS,

    UNISWAP_V3_NFT_MANAGER: process.env.UNISWAP_V3_NFT_MANAGER ?? '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    ETH_PRICE_USD: parseFloat(process.env.ETH_PRICE_USD ?? '3000'),

    APP_PORT: parseInt(process.env.APP_PORT ?? '3000', 10),
    APP_HOST: process.env.APP_HOST ?? '0.0.0.0',
    LOG_LEVEL: (process.env.LOG_LEVEL as RatioEnv['LOG_LEVEL']) ?? 'info',
  };
}

/**
 * Safe env summary for health endpoints.
 * NEVER includes secrets (WALLET_PRIVATE_KEY, LLM_API_KEY, etc.)
 */
export function getPublicEnvSummary() {
  return {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    EXECUTION_MODE: process.env.EXECUTION_MODE ?? 'dry_run',
    DRY_RUN: process.env.EXECUTION_MODE !== 'live',
    ETH_CHAIN_ID: process.env.ETH_CHAIN_ID ?? '1',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
    HAS_WALLET: !!process.env.WALLET_ADDRESS,
    HAS_TELEGRAM: !!process.env.TELEGRAM_BOT_TOKEN,
    HAS_LLM: !!process.env.LLM_API_KEY,
  };
}

export default { validateEnv, getEnv, getPublicEnvSummary };
