ALTER TABLE "Store"
  ALTER COLUMN "contentOrder" SET DEFAULT '["animation-welcome","hero","about","products","gallery","links","contact","location"]',
  ALTER COLUMN "animations" SET DEFAULT '[{"id":"welcome","name":"Bienvenida en movimiento","type":"clarity-marquee","title":"Descubre la tienda","subtitle":"Conoce la selección y encuentra lo que buscas.","media":[]}]',
  ALTER COLUMN "motionDuoEnabled" SET DEFAULT true,
  ALTER COLUMN "motionExperience" SET DEFAULT 'clarity-marquee',
  ALTER COLUMN "motionExperiences" SET DEFAULT '["clarity-marquee"]';

-- Give truly static stores a lightweight opening scene. Stores already using
-- legacy or named motion keep their merchant-authored animation choices.
UPDATE "Store"
SET
  "animations" = '[{"id":"welcome","name":"Bienvenida en movimiento","type":"clarity-marquee","title":"Descubre la tienda","subtitle":"Conoce la selección y encuentra lo que buscas.","media":[]}]'::jsonb,
  "motionDuoEnabled" = true,
  "motionExperience" = 'clarity-marquee',
  "motionExperiences" = '["clarity-marquee"]'::jsonb
WHERE jsonb_array_length("animations"::jsonb) = 0
  AND "motionDuoEnabled" = false;

-- Establish the new first-run sequence while keeping every middle section in
-- its existing relative order. All four keys remain editable after migration.
UPDATE "Store"
SET "contentOrder" = (
  '["animation-welcome"]'::jsonb
  || (("contentOrder"::jsonb - 'animation-welcome' - 'contact' - 'location'))
  || '["contact","location"]'::jsonb
)::json
WHERE "animations"::jsonb @> '[{"id":"welcome"}]'::jsonb;

UPDATE "Store"
SET "contentOrder" = ("contentOrder"::jsonb || '["location"]'::jsonb)::json
WHERE NOT ("contentOrder"::jsonb @> '["location"]'::jsonb);
