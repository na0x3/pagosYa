CREATE TABLE "StoreVisualSignature" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "fingerprint" TEXT NOT NULL,
  "signature" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StoreVisualSignature_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoreVisualSignature_createdAt_idx"
ON "StoreVisualSignature"("createdAt");

CREATE INDEX "StoreVisualSignature_storeId_createdAt_idx"
ON "StoreVisualSignature"("storeId", "createdAt");

CREATE INDEX "StoreVisualSignature_sourceType_sourceId_idx"
ON "StoreVisualSignature"("sourceType", "sourceId");

CREATE INDEX "StoreVisualSignature_fingerprint_idx"
ON "StoreVisualSignature"("fingerprint");

ALTER TABLE "StoreVisualSignature"
ADD CONSTRAINT "StoreVisualSignature_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
