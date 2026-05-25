# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────
# Stage 1: deps
# Install all workspace dependencies with pnpm
# ─────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests only (layer cache friendly)
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml* ./
COPY turbo.json ./

# Copy every package/app package.json so pnpm can resolve the workspace graph
COPY apps/api/package.json ./apps/api/
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

RUN pnpm install --frozen-lockfile --filter @ratio/api...

# ─────────────────────────────────────────────
# Stage 2: builder
# Compile TypeScript
# ─────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

# Copy Prisma schema first so generation works
COPY packages/db/prisma ./packages/db/prisma/

# Copy all source
COPY . .

RUN pnpm --filter @ratio/db run db:generate 2>/dev/null || true
RUN pnpm --filter @ratio/api run build

# ─────────────────────────────────────────────
# Stage 3: runner
# Minimal production image
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml* ./
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/db/node_modules ./packages/db/node_modules

# Prisma generated client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE ${APP_PORT:-3000}

CMD ["node", "apps/api/dist/index.js"]
