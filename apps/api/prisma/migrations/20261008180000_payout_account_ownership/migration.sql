-- Payout account ownership check.
CREATE TYPE "PayoutAccountStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REPLACED');
CREATE TYPE "PayoutAccountOwner" AS ENUM ('PERSON', 'COMPANY', 'SOLE_PROPRIETOR');

CREATE TABLE "PayoutAccount" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BOB',
    "bankCode" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "proofStorageKey" TEXT NOT NULL,
    "proofFileName" TEXT NOT NULL,
    "proofContentType" TEXT NOT NULL,
    "status" "PayoutAccountStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "isChange" BOOLEAN NOT NULL DEFAULT false,
    "ownerType" "PayoutAccountOwner",
    "checks" JSONB,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByOpsUserId" TEXT,
    "reviewedByLabel" TEXT,
    "payableFrom" TIMESTAMP(3),
    "kycSubmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayoutAccount_merchantId_currency_status_idx" ON "PayoutAccount"("merchantId", "currency", "status");

ALTER TABLE "Payout" ADD COLUMN "payoutAccountId" TEXT;

ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_reviewedByOpsUserId_fkey" FOREIGN KEY ("reviewedByOpsUserId") REFERENCES "OpsUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_kycSubmissionId_fkey" FOREIGN KEY ("kycSubmissionId") REFERENCES "MerchantKycSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_payoutAccountId_fkey" FOREIGN KEY ("payoutAccountId") REFERENCES "PayoutAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
