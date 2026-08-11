-- Merchant-controlled storefront section hierarchy plus captioned editorial
-- images that are intentionally separate from purchasable product photos.
ALTER TABLE "Store"
ADD COLUMN "contentOrder" JSONB NOT NULL DEFAULT '["hero","products","about","gallery","links"]',
ADD COLUMN "editorialGallery" JSONB NOT NULL DEFAULT '[]';
