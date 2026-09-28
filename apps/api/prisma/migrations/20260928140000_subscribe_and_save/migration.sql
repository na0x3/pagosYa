-- Subscribe & Save (spec 2026-09-28)
ALTER TABLE "Store" ADD COLUMN "subscriptionsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CustomerSubscription" ALTER COLUMN "planId" DROP NOT NULL;
ALTER TABLE "CustomerSubscription"
  ADD COLUMN "paymentLinkId" TEXT,
  ADD COLUMN "variantId" TEXT,
  ADD COLUMN "extraIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "itemName" TEXT,
  ADD COLUMN "quantity" INTEGER,
  ADD COLUMN "cadence" "ProductSubscriptionCadence",
  ADD COLUMN "discountPercent" INTEGER,
  ADD COLUMN "unitAmount" INTEGER,
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "pendingUnitAmount" INTEGER,
  ADD COLUMN "pendingFrom" TIMESTAMP(3),
  ADD COLUMN "fulfillment" JSONB,
  ADD COLUMN "sourceOrderId" TEXT,
  ADD COLUMN "consumerUserId" TEXT,
  ADD COLUMN "consentText" TEXT,
  ADD COLUMN "consentAt" TIMESTAMP(3),
  ADD COLUMN "missedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pausedAt" TIMESTAMP(3);
CREATE INDEX "CustomerSubscription_paymentLinkId_status_idx" ON "CustomerSubscription"("paymentLinkId", "status");
CREATE INDEX "CustomerSubscription_sourceOrderId_idx" ON "CustomerSubscription"("sourceOrderId");

ALTER TABLE "SubscriptionInvoice" ADD COLUMN "orderId" TEXT;
CREATE UNIQUE INDEX "SubscriptionInvoice_orderId_key" ON "SubscriptionInvoice"("orderId");
