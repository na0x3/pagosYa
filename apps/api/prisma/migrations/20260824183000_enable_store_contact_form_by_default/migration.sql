ALTER TABLE "Store"
ALTER COLUMN "contactFormEnabled" SET DEFAULT true;

-- The interest form is a standard storefront capability. Existing stores
-- receive it too; merchants can still turn it off explicitly in Apariencia.
UPDATE "Store"
SET "contactFormEnabled" = true
WHERE "contactFormEnabled" = false;
