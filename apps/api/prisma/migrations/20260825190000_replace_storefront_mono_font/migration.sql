UPDATE "Store"
SET "fontStyle" = 'modern'
WHERE "fontStyle" = 'mono';

UPDATE "StoreVisualProposal"
SET "config" = jsonb_set("config", '{fontStyle}', '"modern"'::jsonb)
WHERE "config" ->> 'fontStyle' = 'mono';

UPDATE "StoreVisualVersion"
SET "snapshot" = jsonb_set("snapshot", '{fontStyle}', '"modern"'::jsonb)
WHERE "snapshot" ->> 'fontStyle' = 'mono';

ALTER TABLE "Store"
ALTER COLUMN "fontStyle" SET DEFAULT 'modern';
