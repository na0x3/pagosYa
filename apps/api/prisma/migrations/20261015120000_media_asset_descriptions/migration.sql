-- Store voice (spec 2026-10-14, part 1): one line saying what an uploaded photo shows, written the first time the photo is used in
-- a design and kept per merchant and content digest, so the same bytes are never described twice. A new table, so no existing
-- MediaAsset query changes before this migration is applied.
CREATE TABLE "MediaAssetDescription" (
  "merchantId" TEXT NOT NULL,
  "digest" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaAssetDescription_pkey" PRIMARY KEY ("merchantId", "digest")
);
ALTER TABLE "MediaAssetDescription" ADD CONSTRAINT "MediaAssetDescription_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
