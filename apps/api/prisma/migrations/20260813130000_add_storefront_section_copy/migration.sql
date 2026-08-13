ALTER TABLE "Store"
  ADD COLUMN "aboutTitle" TEXT,
  ADD COLUMN "aboutSubtitle" TEXT,
  ADD COLUMN "catalogTitle" TEXT,
  ADD COLUMN "catalogSubtitle" TEXT,
  ADD COLUMN "galleryTitle" TEXT,
  ADD COLUMN "gallerySubtitle" TEXT;

ALTER TABLE "Store"
  ALTER COLUMN "contentOrder" SET DEFAULT '["hero","about","products","gallery","links"]';
