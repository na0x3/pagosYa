-- Purely additive: new column with a default, safe on any existing data.
ALTER TABLE "Store" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
