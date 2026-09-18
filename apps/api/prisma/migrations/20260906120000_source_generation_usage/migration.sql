CREATE TABLE "StoreSourceGeneration" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "activeStoreId" TEXT,
  "baseRevision" INTEGER NOT NULL, "revision" INTEGER, "requestedModel" TEXT NOT NULL,
  "model" TEXT NOT NULL, "maxCredits" INTEGER NOT NULL, "credits" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'RUNNING', "attempts" JSONB NOT NULL DEFAULT '[]',
  "durationMs" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "StoreSourceGeneration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreSourceGeneration_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StoreSourceGeneration_credits_check" CHECK ("credits" >= 0 AND "credits" <= "maxCredits"),
  CONSTRAINT "StoreSourceGeneration_status_check" CHECK ("status" IN ('RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED'))
);
CREATE UNIQUE INDEX "StoreSourceGeneration_activeStoreId_key" ON "StoreSourceGeneration"("activeStoreId");
CREATE INDEX "StoreSourceGeneration_storeId_createdAt_idx" ON "StoreSourceGeneration"("storeId", "createdAt");
