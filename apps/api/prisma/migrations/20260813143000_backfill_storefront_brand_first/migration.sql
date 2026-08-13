-- Move only the legacy generated/default layouts to the new brand-first
-- reading order. Merchant-authored custom orders are left untouched.
UPDATE "Store"
SET "contentOrder" = '["hero","about","gallery","products","links"]'::jsonb
WHERE "contentOrder" IN (
  '["hero","products","about","gallery","links"]'::jsonb,
  '["hero","products","gallery","about","links"]'::jsonb,
  '["hero","products","gallery","links","about"]'::jsonb
);

-- Old proposals/versions predate the six section-copy fields. Explicit nulls
-- are important: applying an old proposal must clear newer copy instead of
-- accidentally mixing two different designs.
UPDATE "StoreVisualProposal"
SET "config" = jsonb_build_object(
  'aboutTitle', NULL,
  'aboutSubtitle', NULL,
  'catalogTitle', NULL,
  'catalogSubtitle', NULL,
  'galleryTitle', NULL,
  'gallerySubtitle', NULL
) || "config";

UPDATE "StoreVisualProposal"
SET "config" = jsonb_set("config", '{contentOrder}', '["hero","about","gallery","products","links"]'::jsonb)
WHERE "config" -> 'contentOrder' IN (
  '["hero","products","about","gallery","links"]'::jsonb,
  '["hero","products","gallery","about","links"]'::jsonb,
  '["hero","products","gallery","links","about"]'::jsonb
);

UPDATE "StoreVisualVersion"
SET "snapshot" = jsonb_build_object(
  'aboutTitle', NULL,
  'aboutSubtitle', NULL,
  'catalogTitle', NULL,
  'catalogSubtitle', NULL,
  'galleryTitle', NULL,
  'gallerySubtitle', NULL
) || "snapshot";
