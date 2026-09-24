-- CreateEnum
CREATE TYPE "RewardSource" AS ENUM ('WHEEL', 'BOARD');

-- CreateEnum
CREATE TYPE "RewardKind" AS ENUM ('XP', 'AI_CREDITS', 'STICKER', 'TIP', 'RESPIN');

-- CreateTable
CREATE TABLE "RewardGrant" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "merchantUserId" TEXT NOT NULL,
    "source" "RewardSource" NOT NULL,
    "kind" "RewardKind" NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "stickerId" TEXT,
    "tipId" TEXT,
    "convertedFrom" "RewardKind",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWheelSpin" (
    "merchantUserId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "grantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyWheelSpin_pkey" PRIMARY KEY ("merchantUserId","day","attempt")
);

-- CreateTable
CREATE TABLE "BoardState" (
    "storeId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rollsUsed" INTEGER NOT NULL DEFAULT 0,
    "lapsCompleted" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardState_pkey" PRIMARY KEY ("storeId")
);

-- CreateTable
CREATE TABLE "AiCreditRedemption" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "generationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCreditRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewardGrant_storeId_kind_idx" ON "RewardGrant"("storeId", "kind");

-- CreateIndex
CREATE INDEX "RewardGrant_merchantId_kind_createdAt_idx" ON "RewardGrant"("merchantId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "RewardGrant_merchantUserId_stickerId_idx" ON "RewardGrant"("merchantUserId", "stickerId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWheelSpin_grantId_key" ON "DailyWheelSpin"("grantId");

-- CreateIndex
CREATE UNIQUE INDEX "AiCreditRedemption_generationId_key" ON "AiCreditRedemption"("generationId");

-- CreateIndex
CREATE INDEX "AiCreditRedemption_merchantId_idx" ON "AiCreditRedemption"("merchantId");

-- AddForeignKey
ALTER TABLE "RewardGrant" ADD CONSTRAINT "RewardGrant_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardGrant" ADD CONSTRAINT "RewardGrant_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardGrant" ADD CONSTRAINT "RewardGrant_merchantUserId_fkey" FOREIGN KEY ("merchantUserId") REFERENCES "MerchantUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWheelSpin" ADD CONSTRAINT "DailyWheelSpin_merchantUserId_fkey" FOREIGN KEY ("merchantUserId") REFERENCES "MerchantUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWheelSpin" ADD CONSTRAINT "DailyWheelSpin_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "RewardGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardState" ADD CONSTRAINT "BoardState_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCreditRedemption" ADD CONSTRAINT "AiCreditRedemption_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


