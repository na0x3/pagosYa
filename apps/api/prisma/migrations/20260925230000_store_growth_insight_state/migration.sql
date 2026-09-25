-- CreateTable
CREATE TABLE "StoreGrowthInsightState" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "until" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreGrowthInsightState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreGrowthInsightState_storeId_insightId_key" ON "StoreGrowthInsightState"("storeId", "insightId");
