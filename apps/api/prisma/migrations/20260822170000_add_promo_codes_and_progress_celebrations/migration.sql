CREATE TYPE "PromoDiscountType" AS ENUM ('PERCENT', 'FIXED');

CREATE TABLE "PromoCode" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "discountType" "PromoDiscountType" NOT NULL,
  "discountValue" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromoCode_discountValue_check" CHECK ("discountValue" > 0)
);

CREATE TABLE "MerchantProgressCelebration" (
  "merchantUserId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "lastCelebratedLevel" INTEGER NOT NULL DEFAULT -1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantProgressCelebration_pkey" PRIMARY KEY ("merchantUserId", "storeId"),
  CONSTRAINT "MerchantProgressCelebration_level_check" CHECK ("lastCelebratedLevel" BETWEEN -1 AND 7)
);

CREATE UNIQUE INDEX "PromoCode_storeId_code_key" ON "PromoCode"("storeId", "code");
CREATE INDEX "PromoCode_storeId_isActive_createdAt_idx" ON "PromoCode"("storeId", "isActive", "createdAt");
CREATE INDEX "MerchantProgressCelebration_storeId_idx" ON "MerchantProgressCelebration"("storeId");

ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantProgressCelebration" ADD CONSTRAINT "MerchantProgressCelebration_merchantUserId_fkey" FOREIGN KEY ("merchantUserId") REFERENCES "MerchantUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantProgressCelebration" ADD CONSTRAINT "MerchantProgressCelebration_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
