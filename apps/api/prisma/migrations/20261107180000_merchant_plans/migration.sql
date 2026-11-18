-- Plans 2026-11-07: monthly YAPI credits per plan; FREE may not publish. Ops sets the plan by hand.
CREATE TYPE "MerchantPlan" AS ENUM ('FREE', 'EMPRENDEDOR', 'PRO');

ALTER TABLE "Merchant" ADD COLUMN "plan" "MerchantPlan" NOT NULL DEFAULT 'FREE';

-- Merchants whose stores are already live keep publishing: they start on EMPRENDEDOR.
UPDATE "Merchant" SET "plan" = 'EMPRENDEDOR'
WHERE "id" IN (SELECT DISTINCT "merchantId" FROM "Store" WHERE "publicVisibility" = true OR "sourcePublishedAt" IS NOT NULL);

CREATE TABLE "MerchantCreditGrant" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantCreditGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MerchantCreditGrant_merchantId_month_idx" ON "MerchantCreditGrant"("merchantId", "month");

ALTER TABLE "MerchantCreditGrant" ADD CONSTRAINT "MerchantCreditGrant_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
