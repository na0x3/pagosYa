/*
  Warnings:

  - You are about to drop the column `backgroundColor` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `logoUrl` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `merchantId` on the `PaymentLink` table. All the data in the column will be lost.
  - You are about to drop the column `slug` on the `PaymentLink` table. All the data in the column will be lost.
  - Added the required column `storeId` to the `PaymentLink` table.

  Every existing PaymentLink becomes its own Store (1:1), carrying over its
  own slug (so old share links keep resolving to the same URL) and the
  owning Merchant's branding (backgroundColor/logoUrl lived on Merchant
  before this migration, move to Store after). This runs before the old
  columns are dropped so the source data is still there to read.
*/
-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "backgroundColor" TEXT,
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- Backfill: one Store per existing PaymentLink, while merchantId/slug/
-- backgroundColor/logoUrl are all still readable on the old columns.
INSERT INTO "Store" ("id", "merchantId", "slug", "name", "logoUrl", "backgroundColor", "status", "createdAt", "updatedAt")
SELECT
    'store_' || pl."id",
    pl."merchantId",
    pl."slug",
    pl."name",
    m."logoUrl",
    m."backgroundColor",
    'ACTIVE',
    pl."createdAt",
    pl."updatedAt"
FROM "PaymentLink" pl
JOIN "Merchant" m ON m."id" = pl."merchantId";

-- AlterTable (nullable first so it can be backfilled before NOT NULL applies)
ALTER TABLE "PaymentLink" ADD COLUMN "storeId" TEXT;

UPDATE "PaymentLink" SET "storeId" = 'store_' || "id";

ALTER TABLE "PaymentLink" ALTER COLUMN "storeId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "PaymentLink" DROP CONSTRAINT "PaymentLink_merchantId_fkey";

-- DropIndex
DROP INDEX "PaymentLink_merchantId_createdAt_idx";

-- DropIndex
DROP INDEX "PaymentLink_slug_key";

-- AlterTable
ALTER TABLE "Merchant" DROP COLUMN "backgroundColor",
DROP COLUMN "logoUrl";

-- AlterTable
ALTER TABLE "PaymentLink" DROP COLUMN "merchantId",
DROP COLUMN "slug";

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE INDEX "Store_merchantId_createdAt_idx" ON "Store"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentLink_storeId_createdAt_idx" ON "PaymentLink"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
