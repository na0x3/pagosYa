-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "MerchantKycSubmission" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "legalRepName" TEXT NOT NULL,
    "legalRepDocumentId" TEXT NOT NULL,
    "payoutBankAccount" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantKycSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantKycSubmission_merchantId_createdAt_idx" ON "MerchantKycSubmission"("merchantId", "createdAt");

-- AddForeignKey
ALTER TABLE "MerchantKycSubmission" ADD CONSTRAINT "MerchantKycSubmission_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
