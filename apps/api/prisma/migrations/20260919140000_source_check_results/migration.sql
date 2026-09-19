CREATE TABLE "SourceCheckResult" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshotDigest" TEXT NOT NULL,
    "runtimeDigest" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "findings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceCheckResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SourceCheckResult_storeId_revision_idx" ON "SourceCheckResult"("storeId", "revision");

ALTER TABLE "SourceCheckResult" ADD CONSTRAINT "SourceCheckResult_storeId_revision_fkey" FOREIGN KEY ("storeId", "revision") REFERENCES "StoreSourceVersion"("storeId", "revision") ON DELETE CASCADE ON UPDATE CASCADE;
