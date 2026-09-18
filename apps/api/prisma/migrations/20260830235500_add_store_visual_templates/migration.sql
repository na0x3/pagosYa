CREATE TABLE "StoreVisualTemplate" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sourceProposalId" TEXT,
  "recipe" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StoreVisualTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Store"
ADD COLUMN "visualSectionLocks" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX "StoreVisualTemplate_merchantId_createdAt_idx"
ON "StoreVisualTemplate"("merchantId", "createdAt");

ALTER TABLE "StoreVisualTemplate"
ADD CONSTRAINT "StoreVisualTemplate_merchantId_fkey"
FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
