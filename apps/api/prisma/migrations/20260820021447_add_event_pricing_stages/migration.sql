-- CreateEnum
CREATE TYPE "EventPricingMode" AS ENUM ('SEATED', 'GENERAL_ADMISSION');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "pricingMode" "EventPricingMode" NOT NULL DEFAULT 'SEATED';

-- AlterTable
ALTER TABLE "EventOrder" ADD COLUMN     "gaPriceStageId" TEXT,
ADD COLUMN     "gaQuantity" INTEGER,
ADD COLUMN     "holdExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "EventTicket" ADD COLUMN     "eventPriceStageId" TEXT,
ADD COLUMN     "gaLabel" TEXT,
ALTER COLUMN "eventSeatId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "EventPriceStage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER,
    "order" INTEGER NOT NULL,
    "heldCount" INTEGER NOT NULL DEFAULT 0,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPriceStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventPriceStage_eventId_order_idx" ON "EventPriceStage"("eventId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "EventPriceStage_eventId_order_key" ON "EventPriceStage"("eventId", "order");

-- CreateIndex
CREATE INDEX "EventOrder_status_holdExpiresAt_idx" ON "EventOrder"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "EventTicket_eventPriceStageId_idx" ON "EventTicket"("eventPriceStageId");

-- AddForeignKey
ALTER TABLE "EventPriceStage" ADD CONSTRAINT "EventPriceStage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrder" ADD CONSTRAINT "EventOrder_gaPriceStageId_fkey" FOREIGN KEY ("gaPriceStageId") REFERENCES "EventPriceStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_eventPriceStageId_fkey" FOREIGN KEY ("eventPriceStageId") REFERENCES "EventPriceStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
