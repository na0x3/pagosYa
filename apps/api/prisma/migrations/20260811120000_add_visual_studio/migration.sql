-- Durable media ownership/lineage plus reversible, bounded AI visual proposals.
CREATE TYPE "MediaAssetKind" AS ENUM ('ORIGINAL', 'AI_DERIVED');
CREATE TYPE "VisualProposalStatus" AS ENUM ('READY', 'APPLIED', 'DISMISSED');

CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT,
  "url" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "kind" "MediaAssetKind" NOT NULL DEFAULT 'ORIGINAL',
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "parentAssetId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreVisualProposal" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "VisualProposalStatus" NOT NULL DEFAULT 'READY',
  "config" JSONB NOT NULL,
  "sourceAssetUrls" JSONB NOT NULL DEFAULT '[]',
  "generatedUrls" JSONB NOT NULL DEFAULT '[]',
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreVisualProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreVisualVersion" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreVisualVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaAsset_url_key" ON "MediaAsset"("url");
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");
CREATE INDEX "MediaAsset_merchantId_createdAt_idx" ON "MediaAsset"("merchantId", "createdAt");
CREATE INDEX "MediaAsset_storeId_createdAt_idx" ON "MediaAsset"("storeId", "createdAt");
CREATE INDEX "StoreVisualProposal_storeId_createdAt_idx" ON "StoreVisualProposal"("storeId", "createdAt");
CREATE INDEX "StoreVisualVersion_storeId_createdAt_idx" ON "StoreVisualVersion"("storeId", "createdAt");

ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreVisualProposal" ADD CONSTRAINT "StoreVisualProposal_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreVisualVersion" ADD CONSTRAINT "StoreVisualVersion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
