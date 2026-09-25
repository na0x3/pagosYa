-- CreateTable
CREATE TABLE "StoreAnalyticsEvent" (
    "id" BIGSERIAL NOT NULL,
    "storeId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "productId" TEXT,
    "target" TEXT,
    "path" TEXT,
    "device" TEXT NOT NULL,
    "referrerHost" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreAnalyticsDaily" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "productId" TEXT NOT NULL DEFAULT '',
    "target" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL,
    "uniqueSessions" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreAnalyticsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreAnalyticsEvent_storeId_createdAt_idx" ON "StoreAnalyticsEvent"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreAnalyticsEvent_createdAt_idx" ON "StoreAnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "StoreAnalyticsDaily_storeId_day_idx" ON "StoreAnalyticsDaily"("storeId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "StoreAnalyticsDaily_storeId_day_type_productId_target_key" ON "StoreAnalyticsDaily"("storeId", "day", "type", "productId", "target");
