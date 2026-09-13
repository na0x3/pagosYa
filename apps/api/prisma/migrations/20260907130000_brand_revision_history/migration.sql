CREATE TABLE "StoreBrandRevision" (
  "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("storeId", "revision")
);
INSERT INTO "StoreBrandRevision" ("storeId", "revision", "data", "createdAt")
SELECT "storeId", "revision", "data", "updatedAt" FROM "StoreBrandProfile" WHERE "revision" > 0;
