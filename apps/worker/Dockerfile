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

COPY apps/worker/package.json ./apps/worker/
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

RUN pnpm install --frozen-lockfile --filter @ratio/worker...

# ─────────────────────────────────────────────
# Stage 2: builder
# ─────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY packages/db/prisma ./packages/db/prisma/
COPY . .

RUN pnpm --filter @ratio/db run db:generate 2>/dev/null || true
RUN pnpm --filter @ratio/worker run build

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

COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules

COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/db/node_modules ./packages/db/node_modules

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Worker is a long-running process, no EXPOSE needed
CMD ["node", "apps/worker/dist/index.js"]
