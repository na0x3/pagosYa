ALTER TABLE "Store"
  ALTER COLUMN "animations" SET DEFAULT '[{"id":"welcome","name":"Bienvenida en movimiento","type":"clarity-marquee","media":[]}]';

UPDATE "Store"
SET "animations" = (
  SELECT jsonb_agg(
    CASE
      WHEN item->>'id' = 'welcome'
        AND item->>'title' = 'Descubre la tienda'
        AND item->>'subtitle' = 'Conoce la selección y encuentra lo que buscas.'
      THEN item - 'title' - 'subtitle'
      ELSE item
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements("animations"::jsonb) WITH ORDINALITY AS entries(item, ordinality)
)
WHERE jsonb_typeof("animations"::jsonb) = 'array'
  AND "animations"::jsonb @> '[{"id":"welcome","title":"Descubre la tienda","subtitle":"Conoce la selección y encuentra lo que buscas."}]'::jsonb;
