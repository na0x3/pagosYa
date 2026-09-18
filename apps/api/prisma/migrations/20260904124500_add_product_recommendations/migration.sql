ALTER TABLE "PaymentLink"
ADD COLUMN "recommendedProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
