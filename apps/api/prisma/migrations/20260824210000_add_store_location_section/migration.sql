ALTER TABLE "Store"
ADD COLUMN "locationMapUrl" TEXT,
ADD COLUMN "locationDescription" TEXT,
ADD COLUMN "locationHighlight" TEXT,
ADD COLUMN "locations" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "PaymentLink"
ADD COLUMN "locationStocks" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "StoreOrder"
ADD COLUMN "fulfillmentLocationId" TEXT,
ADD COLUMN "fulfillmentLocationName" TEXT,
ADD COLUMN "fulfillmentMethod" TEXT,
ADD COLUMN "fulfillmentReadyAt" TIMESTAMP(3);
