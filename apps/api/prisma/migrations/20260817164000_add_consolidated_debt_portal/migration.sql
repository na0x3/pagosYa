ALTER TABLE "Store" ADD COLUMN "debtPortalSlug" TEXT;

-- Keep the oldest shared debt URL as the permanent portal address for each
-- store. Every active collection is resolved behind this one address.
UPDATE "Store" AS store
SET "debtPortalSlug" = portal.slug
FROM (
  SELECT DISTINCT ON ("storeId") "storeId", slug
  FROM "DebtCollectionLink"
  ORDER BY "storeId", "createdAt" ASC
) AS portal
WHERE store.id = portal."storeId";

CREATE UNIQUE INDEX "Store_debtPortalSlug_key" ON "Store"("debtPortalSlug");

-- A single checkout can now settle several selected debt rows atomically.
DROP INDEX IF EXISTS "DebtRecord_paymentIntentId_key";
CREATE INDEX "DebtRecord_paymentIntentId_idx" ON "DebtRecord"("paymentIntentId");

-- A carnet may legitimately have several installments or concepts in the
-- same import. Preserve every debt row and index the lookup instead.
DROP INDEX IF EXISTS "DebtRecord_debtCollectionLinkId_normalizedDocument_key";
CREATE INDEX "DebtRecord_debtCollectionLinkId_normalizedDocument_idx"
  ON "DebtRecord"("debtCollectionLinkId", "normalizedDocument");
