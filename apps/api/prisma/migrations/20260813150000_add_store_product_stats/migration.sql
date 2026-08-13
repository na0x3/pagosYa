CREATE TABLE "StoreProductStat" (
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "paymentLinkId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "revenue" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreProductStat_pkey" PRIMARY KEY ("storeId", "paymentLinkId")
);

ALTER TABLE "StoreProductStat"
ADD CONSTRAINT "StoreProductStat_merchantId_fkey"
FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "StoreProductStat_merchantId_quantity_idx" ON "StoreProductStat"("merchantId", "quantity");
CREATE INDEX "StoreProductStat_storeId_quantity_idx" ON "StoreProductStat"("storeId", "quantity");

-- Backfill once from the historical cart snapshots. Plain API-created
-- payments have no store/cart metadata and intentionally do not contribute.
INSERT INTO "StoreProductStat" (
  "merchantId", "storeId", "paymentLinkId", "productName", "quantity", "revenue", "updatedAt"
)
SELECT
  intent."merchantId",
  intent.metadata ->> 'storeId',
  line.value ->> 'paymentLinkId',
  MAX(line.value ->> 'name'),
  SUM((line.value ->> 'quantity')::integer)::integer,
  COALESCE(SUM((line.value ->> 'quantity')::integer * (line.value ->> 'unitAmount')::integer), 0)::integer,
  CURRENT_TIMESTAMP
FROM "PaymentIntent" AS intent
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(intent.metadata -> 'cart') = 'array'
    THEN intent.metadata -> 'cart'
    ELSE '[]'::jsonb
  END
) AS line(value)
WHERE intent.status = 'SUCCEEDED'
  AND jsonb_typeof(intent.metadata -> 'cart') = 'array'
  AND intent.metadata ->> 'storeId' IS NOT NULL
  AND line.value ->> 'paymentLinkId' IS NOT NULL
GROUP BY intent."merchantId", intent.metadata ->> 'storeId', line.value ->> 'paymentLinkId';
