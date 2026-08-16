CREATE TABLE "StoreLead" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "message" TEXT,
    "items" JSONB NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BOB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoreLead_merchantId_createdAt_idx" ON "StoreLead"("merchantId", "createdAt");
CREATE INDEX "StoreLead_storeId_createdAt_idx" ON "StoreLead"("storeId", "createdAt");

ALTER TABLE "StoreLead" ADD CONSTRAINT "StoreLead_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreLead" ADD CONSTRAINT "StoreLead_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
