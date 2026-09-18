ALTER TABLE "StoreLead" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'NEW', ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "StorePartner" (
 "id" TEXT NOT NULL PRIMARY KEY, "storeId" TEXT NOT NULL, "name" TEXT NOT NULL,
 "code" TEXT NOT NULL, "commissionBps" INTEGER NOT NULL CHECK ("commissionBps" BETWEEN 0 AND 10000),
 "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StorePartner_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StorePartner_code_key" ON "StorePartner"("code");
CREATE INDEX "StorePartner_storeId_createdAt_idx" ON "StorePartner"("storeId", "createdAt");
ALTER TABLE "StoreOrder" ADD COLUMN "partnerId" TEXT, ADD COLUMN "partnerCommissionBps" INTEGER;
ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "StorePartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
