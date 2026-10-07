-- AlterEnum
ALTER TYPE "LedgerAccount" ADD VALUE 'MERCHANT_PENDING';

-- CreateEnum
CREATE TYPE "SettlementHoldStatus" AS ENUM ('PENDING', 'RESERVE_HELD', 'CLOSED');

-- AlterTable
ALTER TABLE "MerchantLevelPolicy" ADD COLUMN "payoutDelayDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN "reserveBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reserveDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN "payoutDelayDaysOverride" INTEGER,
ADD COLUMN "reserveBpsOverride" INTEGER,
ADD COLUMN "reserveDaysOverride" INTEGER,
ADD COLUMN "payoutHoldReason" TEXT,
ADD COLUMN "payoutHeldAt" TIMESTAMP(3),
ADD COLUMN "payoutHeldByLabel" TEXT;

-- CreateTable
CREATE TABLE "SettlementHold" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "netAmount" INTEGER NOT NULL,
    "pendingAmount" INTEGER NOT NULL,
    "reserveAmount" INTEGER NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "reserveReleaseAt" TIMESTAMP(3) NOT NULL,
    "status" "SettlementHoldStatus" NOT NULL DEFAULT 'PENDING',
    "delayDays" INTEGER NOT NULL,
    "reserveBps" INTEGER NOT NULL,
    "reserveDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReserveSeizure" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "opsUserId" TEXT NOT NULL,
    "opsLabel" TEXT NOT NULL,
    "ledgerGroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReserveSeizure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SettlementHold_transactionId_key" ON "SettlementHold"("transactionId");
CREATE INDEX "SettlementHold_status_availableAt_idx" ON "SettlementHold"("status", "availableAt");
CREATE INDEX "SettlementHold_status_reserveReleaseAt_idx" ON "SettlementHold"("status", "reserveReleaseAt");
CREATE INDEX "SettlementHold_merchantId_currency_status_idx" ON "SettlementHold"("merchantId", "currency", "status");
CREATE INDEX "SettlementHold_paymentIntentId_idx" ON "SettlementHold"("paymentIntentId");
CREATE INDEX "ReserveSeizure_merchantId_createdAt_idx" ON "ReserveSeizure"("merchantId", "createdAt");

-- AddForeignKey
ALTER TABLE "SettlementHold" ADD CONSTRAINT "SettlementHold_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReserveSeizure" ADD CONSTRAINT "ReserveSeizure_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Placeholder settlement policy (ops edits these; the bank's numbers replace them).
-- Level 0 cannot take live payments; it carries level 1's numbers in case ops enables it.
UPDATE "MerchantLevelPolicy" SET "payoutDelayDays" = 7, "reserveBps" = 1000, "reserveDays" = 60 WHERE "level" IN (0, 1);
UPDATE "MerchantLevelPolicy" SET "payoutDelayDays" = 3, "reserveBps" = 500, "reserveDays" = 45 WHERE "level" = 2;
UPDATE "MerchantLevelPolicy" SET "payoutDelayDays" = 1, "reserveBps" = 0, "reserveDays" = 0 WHERE "level" = 3;
