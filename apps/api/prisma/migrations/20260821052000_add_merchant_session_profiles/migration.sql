ALTER TABLE "MerchantSession"
  ADD COLUMN "profileName" TEXT NOT NULL DEFAULT 'Propietario',
  ADD COLUMN "profileAvatarId" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- Existing accounts receive one main session: the oldest of the active
-- sessions left after the three-session cleanup migration.
WITH ranked_sessions AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "merchantUserId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS session_rank
  FROM "MerchantSession"
  WHERE "revokedAt" IS NULL
    AND "expiresAt" > CURRENT_TIMESTAMP
)
UPDATE "MerchantSession" AS session
SET "isPrimary" = true
FROM ranked_sessions
WHERE session."id" = ranked_sessions."id"
  AND ranked_sessions.session_rank = 1;
