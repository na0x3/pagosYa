CREATE TABLE "StoreFunnelVisit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "sessionHash" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "productViewedAt" TIMESTAMP(3),
  "cartAddedAt" TIMESTAMP(3),
  "checkoutStartedAt" TIMESTAMP(3),
  "deliverySelectedAt" TIMESTAMP(3),
  "fulfillmentMethod" TEXT,
  CONSTRAINT "StoreFunnelVisit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StoreFunnelVisit_token_key" ON "StoreFunnelVisit"("token");
CREATE UNIQUE INDEX "StoreFunnelVisit_storeId_sessionHash_key" ON "StoreFunnelVisit"("storeId", "sessionHash");
CREATE INDEX "StoreFunnelVisit_storeId_createdAt_idx" ON "StoreFunnelVisit"("storeId", "createdAt");
ALTER TABLE "StoreOrder" ADD COLUMN "funnelVisitId" TEXT;
ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_funnelVisitId_fkey" FOREIGN KEY ("funnelVisitId") REFERENCES "StoreFunnelVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StoreOrder_funnelVisitId_idx" ON "StoreOrder"("funnelVisitId");
