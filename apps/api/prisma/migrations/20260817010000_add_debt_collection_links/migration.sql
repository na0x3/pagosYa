CREATE TYPE "DebtCollectionLinkStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "DebtRecordStatus" AS ENUM ('PENDING', 'PAID');

CREATE TABLE "DebtCollectionLink" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notificationEmail" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'BOB',
    "status" "DebtCollectionLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DebtCollectionLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DebtRecord" (
    "id" TEXT NOT NULL,
    "debtCollectionLinkId" TEXT NOT NULL,
    "customerDocument" TEXT NOT NULL,
    "normalizedDocument" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "description" TEXT,
    "reference" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BOB',
    "status" "DebtRecordStatus" NOT NULL DEFAULT 'PENDING',
    "paymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DebtRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DebtCollectionLink_slug_key" ON "DebtCollectionLink"("slug");
CREATE INDEX "DebtCollectionLink_storeId_createdAt_idx" ON "DebtCollectionLink"("storeId", "createdAt");
CREATE UNIQUE INDEX "DebtRecord_paymentIntentId_key" ON "DebtRecord"("paymentIntentId");
CREATE UNIQUE INDEX "DebtRecord_debtCollectionLinkId_normalizedDocument_key" ON "DebtRecord"("debtCollectionLinkId", "normalizedDocument");
CREATE INDEX "DebtRecord_debtCollectionLinkId_status_idx" ON "DebtRecord"("debtCollectionLinkId", "status");

ALTER TABLE "DebtCollectionLink" ADD CONSTRAINT "DebtCollectionLink_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DebtRecord" ADD CONSTRAINT "DebtRecord_debtCollectionLinkId_fkey"
  FOREIGN KEY ("debtCollectionLinkId") REFERENCES "DebtCollectionLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DebtRecord" ADD CONSTRAINT "DebtRecord_paymentIntentId_fkey"
  FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
