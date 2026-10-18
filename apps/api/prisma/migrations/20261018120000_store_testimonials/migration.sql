-- Trust draw (spec 2026-10-18): a real customer's words the merchant entered, shown as «Reseña de cliente». A new table, so no
-- existing StoreReview query changes before this migration is applied; the API reads it as empty until then.
CREATE TABLE "StoreTestimonial" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "sourceNote" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreTestimonial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoreTestimonial_storeId_status_createdAt_idx" ON "StoreTestimonial"("storeId", "status", "createdAt");

ALTER TABLE "StoreTestimonial" ADD CONSTRAINT "StoreTestimonial_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
