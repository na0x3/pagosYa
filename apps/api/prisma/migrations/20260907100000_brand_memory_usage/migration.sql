CREATE TABLE "StoreBrandProfile" (
  "storeId" TEXT PRIMARY KEY REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "data" JSONB NOT NULL DEFAULT '{"confirmed":[],"suggested":[]}',
  "analysisHash" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "StoreAiUsage" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "stage" TEXT NOT NULL, "model" TEXT NOT NULL, "status" TEXT NOT NULL,
  "responseId" TEXT, "durationMs" INTEGER NOT NULL, "usage" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "StoreAiUsage_storeId_createdAt_idx" ON "StoreAiUsage"("storeId", "createdAt");
