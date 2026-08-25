ALTER TABLE "DebtRecord" ADD COLUMN "customerPhone" TEXT;

-- Public debt lookup is numeric-only. Clean records created by older CSV
-- adaptation prompts that preserved punctuation or department extensions.
-- The existing per-link unique index deliberately makes this migration fail
-- instead of silently merging two records if their numeric identifiers collide.
UPDATE "DebtRecord"
SET
  "customerDocument" = regexp_replace("customerDocument", '[^0-9]', '', 'g'),
  "normalizedDocument" = regexp_replace("normalizedDocument", '[^0-9]', '', 'g');
