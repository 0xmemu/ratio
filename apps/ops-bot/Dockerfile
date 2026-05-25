# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────
# Stage 1: deps
# ─────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml* ./
COPY turbo.json ./

COPY apps/ops-bot/package.json ./apps/ops-bot/
COPY packages/db/package.json ./packages/db/
COPY packages/market-data/package.json ./packages/market-data/
COPY packages/scoring-engine/package.json ./packages/scoring-engine/
COPY packages/strategy-engine/package.json ./packages/strategy-engine/
COPY packages/risk-engine/package.json ./packages/risk-engine/
COPY packages/policy-engine/package.json ./packages/policy-engine/
COPY packages/execution-engine/package.json ./packages/execution-engine/
COPY packages/allocation-engine/package.json ./packages/allocation-engine/
COPY packages/narrative-engine/package.json ./packages/narrative-engine/
COPY packages/llm-gateway/package.json ./packages/llm-gateway/
COPY packages/protocol-v3/package.json ./packages/protocol-v3/
COPY packages/protocol-v4/package.json ./packages/protocol-v4/
COPY packages/backtest-core/package.json ./packages/backtest-core/

# Use --no-frozen-lockfile so builds succeed before a lockfile has been committed.
# Once you run `pnpm install` locally and commit pnpm-lock.yaml, switch this to
# --frozen-lockfile for reproducible production builds.
RUN pnpm install --no-frozen-lockfile --filter @ratio/ops-bot...

# ─────────────────────────────────────────────
# Stage 2: builder
# ─────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY packages/db/prisma ./packages/db/prisma/
COPY . .

RUN pnpm --filter @ratio/db run db:generate 2>/dev/null || true
RUN pnpm --filter @ratio/ops-bot run build

# ─────────────────────────────────────────────
# Stage 3: runner
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml* ./
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/apps/ops-bot/dist ./apps/ops-bot/dist
COPY --from=builder /app/apps/ops-bot/package.json ./apps/ops-bot/
COPY --from=builder /app/apps/ops-bot/node_modules ./apps/ops-bot/node_modules

COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/db/node_modules ./packages/db/node_modules

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# ops-bot is a Telegram long-polling process, no EXPOSE needed
CMD ["node", "apps/ops-bot/dist/index.js"]
