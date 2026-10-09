-- Sellable memberships (spec 2026-10-09).
CREATE TABLE "MembershipPeriod" (
    "id" TEXT NOT NULL,
    "paymentLinkId" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MembershipPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MembershipPeriod_paymentLinkId_months_key" ON "MembershipPeriod"("paymentLinkId", "months");
CREATE INDEX "MembershipPeriod_paymentLinkId_archivedAt_idx" ON "MembershipPeriod"("paymentLinkId", "archivedAt");
ALTER TABLE "MembershipPeriod" ADD CONSTRAINT "MembershipPeriod_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Store" ADD COLUMN "membershipGraceDays" INTEGER NOT NULL DEFAULT 7;

ALTER TABLE "CustomerSubscription" ADD COLUMN "membershipPeriodId" TEXT,
ADD COLUMN "storeCustomerId" TEXT,
ADD COLUMN "accessUntil" TIMESTAMP(3),
ADD COLUMN "pendingPeriodId" TEXT;
CREATE INDEX "CustomerSubscription_storeCustomerId_paymentLinkId_idx" ON "CustomerSubscription"("storeCustomerId", "paymentLinkId");
CREATE INDEX "CustomerSubscription_storeId_membershipPeriodId_status_idx" ON "CustomerSubscription"("storeId", "membershipPeriodId", "status");
