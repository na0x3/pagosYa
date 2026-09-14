CREATE TABLE "DomainOrder" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "hostname" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUOTED', "sandbox" BOOLEAN NOT NULL,
  "providerPriceUsd" DECIMAL(12,2) NOT NULL, "amount" INTEGER NOT NULL,
  "renewalAmount" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'BOB',
  "quoteExpiresAt" TIMESTAMP(3) NOT NULL, "paymentIntentId" TEXT,
  "registrant" JSONB, "acceptedAt" TIMESTAMP(3), "registrationStartedAt" TIMESTAMP(3),
  "providerOrderId" TEXT, "expiresAt" TIMESTAMP(3), "contactVerified" BOOLEAN NOT NULL DEFAULT false,
  "leaseUntil" TIMESTAMP(3), "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0, "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DomainOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DomainOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DomainOrder_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DomainOrder_paymentIntentId_key" ON "DomainOrder"("paymentIntentId");
CREATE INDEX "DomainOrder_storeId_createdAt_idx" ON "DomainOrder"("storeId", "createdAt");
CREATE INDEX "DomainOrder_status_nextAttemptAt_idx" ON "DomainOrder"("status", "nextAttemptAt");
ALTER TABLE "CustomDomain" ADD COLUMN "domainOrderId" TEXT, ADD COLUMN "hostingId" TEXT;
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_domainOrderId_fkey" FOREIGN KEY ("domainOrderId") REFERENCES "DomainOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CustomDomain_domainOrderId_idx" ON "CustomDomain"("domainOrderId");
