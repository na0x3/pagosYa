ALTER TABLE "Store"
ADD COLUMN "announcementFont" TEXT NOT NULL DEFAULT 'store',
ADD COLUMN "announcementEffect" TEXT NOT NULL DEFAULT 'none';

-- Deterministic session digests make verification O(1). Legacy Argon2 session
-- rows cannot be indexed by their presented token, so retire the remaining
-- short-lived rows instead of allowing an attacker to trigger a full-table
-- Argon2 scan with every invalid bearer token.
UPDATE "MerchantSession"
SET "revokedAt" = NOW(), "isPrimary" = FALSE
WHERE "hashedToken" NOT LIKE 'sha256:%' AND "revokedAt" IS NULL;

CREATE UNIQUE INDEX "MerchantSession_hashedToken_key" ON "MerchantSession"("hashedToken");
CREATE INDEX "MerchantSession_merchantUserId_revokedAt_expiresAt_idx"
ON "MerchantSession"("merchantUserId", "revokedAt", "expiresAt");
CREATE INDEX "MerchantSession_merchantId_revokedAt_expiresAt_idx"
ON "MerchantSession"("merchantId", "revokedAt", "expiresAt");

UPDATE "MerchantSession"
SET "isPrimary" = FALSE
WHERE "isPrimary" = TRUE AND ("revokedAt" IS NOT NULL OR "expiresAt" <= NOW());

WITH ranked_primary AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "merchantUserId"
    ORDER BY "createdAt" ASC, "id" ASC
  ) AS position
  FROM "MerchantSession"
  WHERE "isPrimary" = TRUE AND "revokedAt" IS NULL
)
UPDATE "MerchantSession" AS session
SET "isPrimary" = FALSE
FROM ranked_primary
WHERE session."id" = ranked_primary."id" AND ranked_primary.position > 1;

CREATE UNIQUE INDEX "MerchantSession_one_active_primary_per_user_key"
ON "MerchantSession"("merchantUserId")
WHERE "isPrimary" = TRUE AND "revokedAt" IS NULL;
