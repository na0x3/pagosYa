-- A four-column unique index cannot dedupe here: Postgres treats NULLs as
-- distinct, so every lead thread would have been unique to itself. Partial
-- indexes exclude the null column and therefore actually constrain.
DROP INDEX "StoreInboxThread_storeId_customerEmail_leadId_orderId_key";

ALTER TABLE "StoreInboxThread" ADD CONSTRAINT "StoreInboxThread_one_origin"
  CHECK (("leadId" IS NOT NULL) <> ("orderId" IS NOT NULL));

CREATE UNIQUE INDEX "StoreInboxThread_lead_key"
  ON "StoreInboxThread"("storeId", "customerEmail", "leadId") WHERE "orderId" IS NULL;
CREATE UNIQUE INDEX "StoreInboxThread_order_key"
  ON "StoreInboxThread"("storeId", "customerEmail", "orderId") WHERE "leadId" IS NULL;
