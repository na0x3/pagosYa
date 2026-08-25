-- Bring accounts that already had more than three live dashboard sessions
-- into the new cap. Future logins enforce the same limit transactionally.
WITH ranked_sessions AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "merchantUserId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS session_rank
  FROM "MerchantSession"
  WHERE "revokedAt" IS NULL
    AND "expiresAt" > CURRENT_TIMESTAMP
)
UPDATE "MerchantSession" AS session
SET "revokedAt" = CURRENT_TIMESTAMP
FROM ranked_sessions
WHERE session."id" = ranked_sessions."id"
  AND ranked_sessions.session_rank > 3;
