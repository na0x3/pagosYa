-- Store-level content, product categories, and richer product fields
-- (image gallery, tags, stock). See "This session" notes for the reasoning.
--
-- imageUrl -> imageUrls is a genuine column replacement, not additive — the
-- old column is dropped at the end of this migration. Backfill first, drop
-- last, same lesson as the multi_store migration fix earlier this session.

-- AlterTable: Store gets tagline/bannerUrl
ALTER TABLE "Store" ADD COLUMN "tagline" TEXT,
ADD COLUMN "bannerUrl" TEXT;

-- CreateTable: Category
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Category_storeId_sortOrder_idx" ON "Category"("storeId", "sortOrder");

ALTER TABLE "Category" ADD CONSTRAINT "Category_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: PaymentLink gets categoryId, imageUrls (nullable first), tags, stock
ALTER TABLE "PaymentLink" ADD COLUMN "categoryId" TEXT,
ADD COLUMN "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "stock" INTEGER;

-- Backfill: every existing product's single imageUrl becomes a one-element
-- gallery. Rows with no image get an empty array (the column default).
UPDATE "PaymentLink" SET "imageUrls" = ARRAY["imageUrl"] WHERE "imageUrl" IS NOT NULL;

-- Now safe to drop the old column — every non-null value was preserved above.
ALTER TABLE "PaymentLink" DROP COLUMN "imageUrl";

-- imageUrls/tags should behave like the existing default(([])) empty-array
-- columns elsewhere in this schema: never NULL. Enforce NOT NULL now that
-- every row has been backfilled (existing rows either got a value above or
-- already default to '{}' from the ADD COLUMN default).
ALTER TABLE "PaymentLink" ALTER COLUMN "imageUrls" SET NOT NULL,
ALTER COLUMN "tags" SET NOT NULL;

CREATE INDEX "PaymentLink_categoryId_idx" ON "PaymentLink"("categoryId");

ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
