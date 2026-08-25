ALTER TABLE "Store"
ADD COLUMN "contactFormEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "contactFormEmail" TEXT;

UPDATE "Store"
SET "contentOrder" = (
  CASE
    WHEN "contentOrder"::jsonb @> '["contact"]'::jsonb THEN "contentOrder"::jsonb
    ELSE (
      SELECT jsonb_agg(value ORDER BY position)
      FROM (
        SELECT value, ordinality * 2 AS position
        FROM jsonb_array_elements_text("contentOrder"::jsonb) WITH ORDINALITY
        UNION ALL
        SELECT 'contact', COALESCE(
          (SELECT ordinality * 2 - 1 FROM jsonb_array_elements_text("contentOrder"::jsonb) WITH ORDINALITY WHERE value = 'links' LIMIT 1),
          jsonb_array_length("contentOrder"::jsonb) * 2 + 1
        )
      ) ordered_sections
    )
  END
)::json;
