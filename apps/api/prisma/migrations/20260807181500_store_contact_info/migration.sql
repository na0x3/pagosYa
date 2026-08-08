-- Purely additive: new nullable columns, safe on any existing data.
ALTER TABLE "Store" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Store" ADD COLUMN "contactEmail" TEXT;
