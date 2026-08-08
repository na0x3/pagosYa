-- Purely additive: new nullable columns, safe on any existing data.
ALTER TABLE "PaymentIntent" ADD COLUMN "customerEmail" TEXT;
ALTER TABLE "PaymentIntent" ADD COLUMN "customerPhone" TEXT;
