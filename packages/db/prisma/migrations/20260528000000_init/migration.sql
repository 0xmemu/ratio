-- CreateTable
CREATE TABLE "Pool" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "token0" TEXT NOT NULL,
    "token1" TEXT NOT NULL,
    "token0Symbol" TEXT NOT NULL,
    "token1Symbol" TEXT NOT NULL,
    "feeTier" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBlueChip" BOOLEAN NOT NULL DEFAULT true,
    "isNewListing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolSnapshot" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "sqrtPriceX96" TEXT NOT NULL,
    "liquidity" TEXT NOT NULL,
    "tvlUsd" DOUBLE PRECISION NOT NULL,
    "volume24hUsd" DOUBLE PRECISION NOT NULL,
    "feesUsd24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "token0Price" DOUBLE PRECISION NOT NULL,
    "token1Price" DOUBLE PRECISION NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoolSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolScore" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "profitComponent" DOUBLE PRECISION NOT NULL,
    "volumeComponent" DOUBLE PRECISION NOT NULL,
    "riskComponent" DOUBLE PRECISION NOT NULL,
    "recencyComponent" DOUBLE PRECISION NOT NULL,
    "netProfitUsd7d" DOUBLE PRECISION NOT NULL,
    "volume7dUsd" DOUBLE PRECISION NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "daysSinceLastRebalance" INTEGER NOT NULL,
    "windowStartAt" TIMESTAMP(3) NOT NULL,
    "windowEndAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoolScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "tokenId" TEXT,
    "tickLower" INTEGER NOT NULL,
    "tickUpper" INTEGER NOT NULL,
    "liquidity" TEXT NOT NULL,
    "capitalUsd" DOUBLE PRECISION NOT NULL,
    "bucket" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "entryTxHash" TEXT,
    "exitTxHash" TEXT,
    "entryTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitTimestamp" TIMESTAMP(3),
    "pnlUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feesCollectedUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebalanceDecision" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "positionId" TEXT,
    "strategyVersionId" TEXT,
    "action" TEXT NOT NULL,
    "tickLower" INTEGER NOT NULL,
    "tickUpper" INTEGER NOT NULL,
    "capitalUsd" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "isDryRun" BOOLEAN NOT NULL DEFAULT true,
    "policyApprovalId" TEXT,
    "executedAt" TIMESTAMP(3),
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RebalanceDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "drawdownPct" DOUBLE PRECISION NOT NULL,
    "concentrationPct" DOUBLE PRECISION NOT NULL,
    "volatility7d" DOUBLE PRECISION NOT NULL,
    "isAllowed" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationRun" (
    "id" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "strategyName" TEXT NOT NULL,
    "startTimestamp" TIMESTAMP(3) NOT NULL,
    "endTimestamp" TIMESTAMP(3) NOT NULL,
    "initialCapital" DOUBLE PRECISION NOT NULL,
    "netPnlUsd" DOUBLE PRECISION NOT NULL,
    "feesEarnedUsd" DOUBLE PRECISION NOT NULL,
    "gasCostUsd" DOUBLE PRECISION NOT NULL,
    "maxDrawdownPct" DOUBLE PRECISION NOT NULL,
    "rebalanceCount" INTEGER NOT NULL,
    "sharpeRatio" DOUBLE PRECISION NOT NULL,
    "snapshotCount" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NarrativeReport" (
    "id" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "llmModel" TEXT NOT NULL,
    "sandboxMode" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NarrativeReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "decisionId" TEXT,
    "actor" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceHeartbeat" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "ServiceHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pool_address_key" ON "Pool"("address");

-- CreateIndex
CREATE INDEX "Pool_address_idx" ON "Pool"("address");

-- CreateIndex
CREATE INDEX "Pool_isActive_idx" ON "Pool"("isActive");

-- CreateIndex
CREATE INDEX "PoolSnapshot_poolId_timestamp_idx" ON "PoolSnapshot"("poolId", "timestamp");

-- CreateIndex
CREATE INDEX "PoolScore_poolId_createdAt_idx" ON "PoolScore"("poolId", "createdAt");

-- CreateIndex
CREATE INDEX "PoolScore_rank_idx" ON "PoolScore"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_version_key" ON "StrategyVersion"("version");

-- CreateIndex
CREATE INDEX "Position_poolId_status_idx" ON "Position"("poolId", "status");

-- CreateIndex
CREATE INDEX "Position_status_idx" ON "Position"("status");

-- CreateIndex
CREATE INDEX "RebalanceDecision_poolId_status_idx" ON "RebalanceDecision"("poolId", "status");

-- CreateIndex
CREATE INDEX "RebalanceDecision_status_isDryRun_idx" ON "RebalanceDecision"("status", "isDryRun");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_decisionId_key" ON "Approval"("decisionId");

-- CreateIndex
CREATE INDEX "Approval_status_idx" ON "Approval"("status");

-- CreateIndex
CREATE INDEX "Approval_expiresAt_idx" ON "Approval"("expiresAt");

-- CreateIndex
CREATE INDEX "RiskAssessment_poolId_createdAt_idx" ON "RiskAssessment"("poolId", "createdAt");

-- CreateIndex
CREATE INDEX "SimulationRun_poolAddress_idx" ON "SimulationRun"("poolAddress");

-- CreateIndex
CREATE INDEX "SimulationRun_createdAt_idx" ON "SimulationRun"("createdAt");

-- CreateIndex
CREATE INDEX "NarrativeReport_poolAddress_createdAt_idx" ON "NarrativeReport"("poolAddress", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_createdAt_idx" ON "AuditEvent"("eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceHeartbeat_service_key" ON "ServiceHeartbeat"("service");

-- AddForeignKey
ALTER TABLE "PoolSnapshot" ADD CONSTRAINT "PoolSnapshot_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolScore" ADD CONSTRAINT "PoolScore_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebalanceDecision" ADD CONSTRAINT "RebalanceDecision_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebalanceDecision" ADD CONSTRAINT "RebalanceDecision_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebalanceDecision" ADD CONSTRAINT "RebalanceDecision_strategyVersionId_fkey" FOREIGN KEY ("strategyVersionId") REFERENCES "StrategyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "RebalanceDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "RebalanceDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

