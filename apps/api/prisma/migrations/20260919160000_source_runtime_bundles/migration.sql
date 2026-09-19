CREATE TABLE "SourceRuntimeBundle" (
    "digest" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceRuntimeBundle_pkey" PRIMARY KEY ("digest")
);

CREATE TABLE "StoreRuntimePublication" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreRuntimePublication_pkey" PRIMARY KEY ("id")
);

-- Null means the store follows the latest trusted kit; a digest is set only by an explicit rollback.
ALTER TABLE "Store" ADD COLUMN "publishedRuntimeDigest" TEXT;

CREATE INDEX "StoreRuntimePublication_storeId_digest_publishedAt_idx"
    ON "StoreRuntimePublication"("storeId", "digest", "publishedAt");

ALTER TABLE "Store" ADD CONSTRAINT "Store_publishedRuntimeDigest_fkey"
    FOREIGN KEY ("publishedRuntimeDigest") REFERENCES "SourceRuntimeBundle"("digest") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoreRuntimePublication" ADD CONSTRAINT "StoreRuntimePublication_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreRuntimePublication" ADD CONSTRAINT "StoreRuntimePublication_digest_fkey"
    FOREIGN KEY ("digest") REFERENCES "SourceRuntimeBundle"("digest") ON DELETE RESTRICT ON UPDATE CASCADE;
