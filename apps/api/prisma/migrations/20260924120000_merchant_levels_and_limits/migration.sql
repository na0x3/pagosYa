-- CreateEnum
CREATE TYPE "LimitReservationStatus" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED');

-- CreateEnum
CREATE TYPE "KycDocumentSlot" AS ENUM ('CI_FRONT', 'CI_BACK', 'SELFIE');

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "monthlyLimitOverride" INTEGER,
ADD COLUMN     "perPaymentLimitOverride" INTEGER;

-- AlterTable
ALTER TABLE "MerchantKycSubmission" ADD COLUMN     "ciBackDocId" TEXT,
ADD COLUMN     "ciFrontDocId" TEXT,
ADD COLUMN     "selfieDocId" TEXT,
ADD COLUMN     "targetLevel" INTEGER NOT NULL DEFAULT 2,
ALTER COLUMN "taxId" DROP NOT NULL,
ALTER COLUMN "legalRepName" DROP NOT NULL,
ALTER COLUMN "legalRepDocumentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PaymentIntent" ADD COLUMN     "limitAmountBob" INTEGER,
ADD COLUMN     "limitFxRate" DECIMAL(10,4),
ADD COLUMN     "limitMonth" TEXT,
ADD COLUMN     "limitStatus" "LimitReservationStatus";

-- CreateTable
CREATE TABLE "MerchantLevelPolicy" (
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "liveEnabled" BOOLEAN NOT NULL,
    "monthlyLimit" INTEGER,
    "perPaymentLimit" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantLevelPolicy_pkey" PRIMARY KEY ("level")
);

-- CreateTable
CREATE TABLE "LimitSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "usdToBobRate" DECIMAL(10,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LimitSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantMonthlyVolume" (
    "merchantId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "settled" INTEGER NOT NULL DEFAULT 0,
    "warnedAt" TIMESTAMP(3),

    CONSTRAINT "MerchantMonthlyVolume_pkey" PRIMARY KEY ("merchantId","month")
);

-- CreateTable
CREATE TABLE "MerchantKycDocument" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "slot" "KycDocumentSlot" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantKycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantKycDocument_storageKey_key" ON "MerchantKycDocument"("storageKey");

-- CreateIndex
CREATE INDEX "MerchantKycDocument_merchantId_createdAt_idx" ON "MerchantKycDocument"("merchantId", "createdAt");

-- AddForeignKey
ALTER TABLE "MerchantMonthlyVolume" ADD CONSTRAINT "MerchantMonthlyVolume_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantKycDocument" ADD CONSTRAINT "MerchantKycDocument_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Placeholder limits (centavos BOB). Ops edits these; the bank's numbers replace them.
INSERT INTO "MerchantLevelPolicy" ("level", "name", "liveEnabled", "monthlyLimit", "perPaymentLimit", "updatedAt") VALUES
  (0, 'Sin verificar', false, NULL, NULL, CURRENT_TIMESTAMP),
  (1, 'Persona', true, 1000000, 200000, CURRENT_TIMESTAMP),
  (2, 'Negocio', true, 10000000, 2000000, CURRENT_TIMESTAMP),
  (3, 'Empresa', true, NULL, NULL, CURRENT_TIMESTAMP);

INSERT INTO "LimitSettings" ("id", "usdToBobRate", "updatedAt") VALUES ('singleton', 6.96, CURRENT_TIMESTAMP);

-- Merchants already live keep collecting: approved KYC or already ACTIVE -> level 2.
UPDATE "Merchant" SET "level" = 2
WHERE "status" = 'ACTIVE'
   OR "id" IN (SELECT "merchantId" FROM "MerchantKycSubmission" WHERE "status" = 'APPROVED');

