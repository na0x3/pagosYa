ALTER TABLE "Store" ADD COLUMN "shippingEnabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "shippingPickupEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PaymentLink" ADD COLUMN "shippingWeightGrams" INTEGER;
ALTER TABLE "DeliveryZone" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'BOB', ADD COLUMN "freeAbove" INTEGER, ADD COLUMN "maximumOrder" INTEGER, ADD COLUMN "minimumWeightGrams" INTEGER, ADD COLUMN "maximumWeightGrams" INTEGER;
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_shipping_bounds" CHECK ("fee" >= 0 AND "minimumOrder" >= 0 AND ("freeAbove" IS NULL OR "freeAbove" >= 0) AND ("maximumOrder" IS NULL OR "maximumOrder" >= "minimumOrder") AND ("minimumWeightGrams" IS NULL OR "minimumWeightGrams" >= 0) AND ("maximumWeightGrams" IS NULL OR "maximumWeightGrams" >= COALESCE("minimumWeightGrams", 0)));
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_shipping_weight" CHECK ("shippingWeightGrams" IS NULL OR "shippingWeightGrams" >= 0);
