-- CreateEnum
CREATE TYPE "LegalDocumentKind" AS ENUM ('MERCHANT_TERMS', 'BUYER_TERMS', 'PRIVACY_POLICY');

-- CreateEnum
CREATE TYPE "TermsAcceptanceSource" AS ENUM ('WEB_SIGNUP', 'DASHBOARD');

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "kind" "LegalDocumentKind" NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByOpsUserId" TEXT,
    "publishedByLabel" TEXT NOT NULL,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantTermsAcceptance" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantUserId" TEXT,
    "documentId" TEXT NOT NULL,
    "source" "TermsAcceptanceSource" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantTermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerTermsAcceptance" (
    "id" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "termsDocumentId" TEXT NOT NULL,
    "privacyDocumentId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerTermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalDocument_kind_effectiveAt_idx" ON "LegalDocument"("kind", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_kind_version_key" ON "LegalDocument"("kind", "version");

-- CreateIndex
CREATE INDEX "MerchantTermsAcceptance_merchantId_acceptedAt_idx" ON "MerchantTermsAcceptance"("merchantId", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantTermsAcceptance_merchantId_documentId_key" ON "MerchantTermsAcceptance"("merchantId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerTermsAcceptance_paymentIntentId_key" ON "BuyerTermsAcceptance"("paymentIntentId");

-- AddForeignKey
ALTER TABLE "LegalDocument" ADD CONSTRAINT "LegalDocument_publishedByOpsUserId_fkey" FOREIGN KEY ("publishedByOpsUserId") REFERENCES "OpsUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantTermsAcceptance" ADD CONSTRAINT "MerchantTermsAcceptance_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantTermsAcceptance" ADD CONSTRAINT "MerchantTermsAcceptance_merchantUserId_fkey" FOREIGN KEY ("merchantUserId") REFERENCES "MerchantUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantTermsAcceptance" ADD CONSTRAINT "MerchantTermsAcceptance_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LegalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerTermsAcceptance" ADD CONSTRAINT "BuyerTermsAcceptance_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerTermsAcceptance" ADD CONSTRAINT "BuyerTermsAcceptance_termsDocumentId_fkey" FOREIGN KEY ("termsDocumentId") REFERENCES "LegalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerTermsAcceptance" ADD CONSTRAINT "BuyerTermsAcceptance_privacyDocumentId_fkey" FOREIGN KEY ("privacyDocumentId") REFERENCES "LegalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
