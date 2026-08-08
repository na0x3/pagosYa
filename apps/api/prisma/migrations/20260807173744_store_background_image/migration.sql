-- Purely additive: new nullable column, safe on any existing data.
ALTER TABLE "Store" ADD COLUMN "backgroundImageUrl" TEXT;
