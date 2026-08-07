/*
  Warnings:

  - You are about to drop the column `backgroundColor` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `logoUrl` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `merchantId` on the `PaymentLink` table. All the data in the column will be lost.
  - You are about to drop the column `slug` on the `PaymentLink` table. All the data in the column will be lost.
  - Added the required column `storeId` to the `PaymentLink` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

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
DROP COLUMN "slug",
ADD COLUMN     "storeId" TEXT NOT NULL;

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
