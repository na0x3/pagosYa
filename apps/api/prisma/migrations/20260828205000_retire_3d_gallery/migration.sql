WITH normalized AS (
  SELECT
    store."id",
    COALESCE((
      SELECT jsonb_agg(entry.item ORDER BY entry.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(store."animations"::jsonb) = 'array' THEN store."animations"::jsonb ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS entry(item, ordinality)
      WHERE entry.item->>'type' <> '3d-gallery'
    ), '[]'::jsonb) AS retained_animations,
    ARRAY(
      SELECT 'animation-' || (entry.item->>'id')
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(store."animations"::jsonb) = 'array' THEN store."animations"::jsonb ELSE '[]'::jsonb END
      ) AS entry(item)
      WHERE entry.item->>'type' = '3d-gallery'
        AND entry.item->>'id' IS NOT NULL
    ) AS retired_section_keys,
    COALESCE((
      SELECT jsonb_agg(entry.value ORDER BY entry.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(store."motionExperiences"::jsonb) = 'array' THEN store."motionExperiences"::jsonb ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS entry(value, ordinality)
      WHERE entry.value #>> '{}' <> '3d-gallery'
    ), '[]'::jsonb) AS retained_motion_experiences
  FROM "Store" AS store
)
UPDATE "Store" AS store
SET
  "animations" = normalized.retained_animations,
  "motionExperiences" = normalized.retained_motion_experiences,
  "motionExperience" = CASE
    WHEN store."motionExperience" = '3d-gallery' THEN COALESCE(
      normalized.retained_motion_experiences->>0,
      normalized.retained_animations->0->>'type',
      'clarity-marquee'
    )
    ELSE store."motionExperience"
  END,
  "motionDuoEnabled" = CASE
    WHEN jsonb_array_length(normalized.retained_animations) = 0
      AND jsonb_array_length(normalized.retained_motion_experiences) = 0
      AND (
        store."motionExperience" = '3d-gallery'
        OR array_length(normalized.retired_section_keys, 1) IS NOT NULL
      )
    THEN false
    ELSE store."motionDuoEnabled"
  END,
  "contentOrder" = COALESCE((
    SELECT jsonb_agg(to_jsonb(entry.value) ORDER BY entry.ordinality)
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(store."contentOrder"::jsonb) = 'array' THEN store."contentOrder"::jsonb ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entry(value, ordinality)
    WHERE entry.value <> 'motion-3d-gallery'
      AND NOT (entry.value = ANY(normalized.retired_section_keys))
  ), '[]'::jsonb),
  "siteDocument" = CASE
    WHEN store."siteDocument" IS NOT NULL
      AND store."siteDocument"::jsonb #>> '{experience,type}' = '3d-gallery'
    THEN jsonb_set(
      jsonb_set(store."siteDocument"::jsonb, '{experience,type}', '"none"'::jsonb, true),
      '{experience,mediaUrls}',
      '[]'::jsonb,
      true
    )
    ELSE store."siteDocument"::jsonb
  END
FROM normalized
WHERE store."id" = normalized."id"
  AND (
    store."motionExperience" = '3d-gallery'
    OR store."animations"::jsonb @> '[{"type":"3d-gallery"}]'::jsonb
    OR store."motionExperiences"::jsonb @> '["3d-gallery"]'::jsonb
    OR store."contentOrder"::jsonb @> '["motion-3d-gallery"]'::jsonb
    OR store."siteDocument"::jsonb #>> '{experience,type}' = '3d-gallery'
  );
