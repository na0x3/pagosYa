-- A promo code reaches an email only when the merchant marks it; existing codes stay private.
ALTER TABLE "PromoCode" ADD COLUMN "showInEmails" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StoreEmailContent" (
    "storeId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreEmailContent_pkey" PRIMARY KEY ("storeId")
);

-- AddForeignKey
ALTER TABLE "StoreEmailContent" ADD CONSTRAINT "StoreEmailContent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
