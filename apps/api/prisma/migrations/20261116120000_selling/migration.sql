-- «La tienda que vende sola» (spec 2026-11-16)
ALTER TABLE "Store" ADD COLUMN "autoImprove" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StoreAnalyticsEvent" ADD COLUMN "experimentId" TEXT, ADD COLUMN "variant" TEXT;
CREATE INDEX "StoreAnalyticsEvent_experimentId_type_idx" ON "StoreAnalyticsEvent"("experimentId", "type");
CREATE TABLE "StoreSellingChange" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "settings" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'TRYING',
  "experimentId" TEXT,
  "summary" TEXT,
  "evidence" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "StoreSellingChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreSellingChange_storeId_status_idx" ON "StoreSellingChange"("storeId", "status");
CREATE INDEX "StoreSellingChange_storeId_endedAt_idx" ON "StoreSellingChange"("storeId", "endedAt");
ALTER TABLE "StoreSellingChange" ADD CONSTRAINT "StoreSellingChange_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
