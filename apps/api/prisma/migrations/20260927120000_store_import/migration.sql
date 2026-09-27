-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "importBuildUsedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StoreSourceGeneration" ADD COLUMN     "sponsor" TEXT;

-- CreateTable
CREATE TABLE "StoreImport" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "storeId" TEXT,
    "source" TEXT NOT NULL,
    "sourceHost" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "data" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "exchangeRateMilli" INTEGER,
    "excluded" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photos" JSONB NOT NULL DEFAULT '{}',
    "progress" JSONB NOT NULL DEFAULT '{}',
    "summary" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "designOption" TEXT,
    "designStatus" TEXT,
    "designTries" INTEGER NOT NULL DEFAULT 0,
    "designRevision" INTEGER,
    "designError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StoreImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreImportLink" (
    "storeId" TEXT NOT NULL,
    "sourceHost" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "skus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreImportLink_pkey" PRIMARY KEY ("storeId","sourceHost","kind","externalId")
);

-- CreateIndex
CREATE INDEX "StoreImport_merchantId_createdAt_idx" ON "StoreImport"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreImport_status_updatedAt_idx" ON "StoreImport"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "StoreImport_designStatus_updatedAt_idx" ON "StoreImport"("designStatus", "updatedAt");

-- AddForeignKey
ALTER TABLE "StoreImport" ADD CONSTRAINT "StoreImport_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreImport" ADD CONSTRAINT "StoreImport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreImportLink" ADD CONSTRAINT "StoreImportLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

