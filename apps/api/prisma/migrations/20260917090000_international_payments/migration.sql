-- CreateEnum
CREATE TYPE "InternationalPaymentsStatus" AS ENUM ('OFF', 'REQUESTED', 'ENABLED', 'REJECTED');

-- AlterEnum
ALTER TYPE "PaymentMethodType" ADD VALUE 'LOCAL_METHOD';

-- AlterEnum
ALTER TYPE "LedgerAccount" ADD VALUE 'RAIL_COST';

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "internationalPaymentsNote" TEXT,
ADD COLUMN     "internationalPaymentsStatus" "InternationalPaymentsStatus" NOT NULL DEFAULT 'OFF';

-- AlterTable
ALTER TABLE "MerchantKycSubmission" ADD COLUMN     "payoutUsdBankAccount" TEXT;

-- CreateIndex
CREATE INDEX "PaymentIntent_railId_status_updatedAt_idx" ON "PaymentIntent"("railId", "status", "updatedAt");

