ALTER TABLE "Store"
ALTER COLUMN "motionExperience" SET DEFAULT 'coverflow-carousel';

UPDATE "Store"
SET "motionExperience" = 'coverflow-carousel'
WHERE "motionExperience" IN ('both', 'zoom-parallax')
   OR "motionExperience" IS NULL;

UPDATE "Store"
SET "contentOrder" = '["hero","about","products","gallery","motion","links"]'::jsonb
WHERE "contentOrder" = '["hero","about","products","gallery","links"]'::jsonb;
