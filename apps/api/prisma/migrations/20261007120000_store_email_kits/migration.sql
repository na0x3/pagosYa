CREATE TYPE "StoreEmailKitStatus" AS ENUM ('CANDIDATE', 'ACTIVE', 'PREVIOUS');

CREATE TABLE "StoreEmailKit" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "status" "StoreEmailKitStatus" NOT NULL,
  "mode" TEXT NOT NULL,
  "layout" TEXT NOT NULL,
  "blocks" TEXT NOT NULL,
  "copy" JSONB NOT NULL,
  "designedFromRevision" INTEGER,
  "model" TEXT,
  "credits" INTEGER NOT NULL DEFAULT 0,
  "repairs" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreEmailKit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreEmailKit_storeId_status_key" ON "StoreEmailKit"("storeId", "status");
ALTER TABLE "StoreEmailKit" ADD CONSTRAINT "StoreEmailKit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StoreEmailCopyOverride" (
  "storeId" TEXT NOT NULL,
  "emailType" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreEmailCopyOverride_pkey" PRIMARY KEY ("storeId", "emailType", "field")
);
ALTER TABLE "StoreEmailCopyOverride" ADD CONSTRAINT "StoreEmailCopyOverride_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
