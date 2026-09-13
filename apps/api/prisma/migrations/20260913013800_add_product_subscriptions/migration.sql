/*
  Warnings:

  - You are about to drop the column `idempotencyKeyHash` on the `EventRefund` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ProductSubscriptionCadence" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_serviceOfferingId_fkey";

-- DropForeignKey
ALTER TABLE "AutomationDelivery" DROP CONSTRAINT "AutomationDelivery_automationId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerFavorite" DROP CONSTRAINT "CustomerFavorite_consumerUserId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerFavorite" DROP CONSTRAINT "CustomerFavorite_paymentLinkId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerLoyaltyEntry" DROP CONSTRAINT "CustomerLoyaltyEntry_customerId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerReturnRequest" DROP CONSTRAINT "CustomerReturnRequest_consumerUserId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerReturnRequest" DROP CONSTRAINT "CustomerReturnRequest_orderId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerSubscription" DROP CONSTRAINT "CustomerSubscription_customerId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerSubscription" DROP CONSTRAINT "CustomerSubscription_planId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryAssignment" DROP CONSTRAINT "DeliveryAssignment_courierId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryAssignment" DROP CONSTRAINT "DeliveryAssignment_orderId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryAssignment" DROP CONSTRAINT "DeliveryAssignment_zoneId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "EventOrder" DROP CONSTRAINT "EventOrder_gaPriceStageId_fkey";

-- DropForeignKey
ALTER TABLE "EventOrder" DROP CONSTRAINT "EventOrder_paymentIntentId_fkey";

-- DropForeignKey
ALTER TABLE "EventTicket" DROP CONSTRAINT "EventTicket_eventOrderId_fkey";

-- DropForeignKey
ALTER TABLE "EventTicket" DROP CONSTRAINT "EventTicket_eventPriceStageId_fkey";

-- DropForeignKey
ALTER TABLE "EventTicket" DROP CONSTRAINT "EventTicket_eventSeatId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationProductMapping" DROP CONSTRAINT "IntegrationProductMapping_connectionId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationProductMapping" DROP CONSTRAINT "IntegrationProductMapping_paymentLinkId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationSyncRun" DROP CONSTRAINT "IntegrationSyncRun_connectionId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_paymentLinkId_fkey";

-- DropForeignKey
ALTER TABLE "PosSale" DROP CONSTRAINT "PosSale_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrderItem" DROP CONSTRAINT "PurchaseOrderItem_paymentLinkId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrderItem" DROP CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey";

-- DropForeignKey
ALTER TABLE "ReconciliationEntry" DROP CONSTRAINT "ReconciliationEntry_importId_fkey";

-- DropForeignKey
ALTER TABLE "ReconciliationEntry" DROP CONSTRAINT "ReconciliationEntry_transactionId_fkey";

-- DropForeignKey
ALTER TABLE "StoreCreditReservation" DROP CONSTRAINT "StoreCreditReservation_paymentIntentId_fkey";

-- DropForeignKey
ALTER TABLE "SubscriptionInvoice" DROP CONSTRAINT "SubscriptionInvoice_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "SupportCase" DROP CONSTRAINT "SupportCase_createdByOpsUserId_fkey";

-- DropIndex
DROP INDEX "Event_merchantId_createdAt_idx";

-- DropIndex
DROP INDEX "Event_storeId_createdAt_idx";

-- DropIndex
DROP INDEX "EventOrder_buyerEmail_createdAt_idx";

-- DropIndex
DROP INDEX "EventOrder_eventId_createdAt_idx";

-- DropIndex
DROP INDEX "EventOrder_status_holdExpiresAt_idx";

-- DropIndex
DROP INDEX "EventPriceStage_eventId_order_idx";

-- DropIndex
DROP INDEX "EventPriceStage_eventId_order_key";

-- DropIndex
DROP INDEX "EventRefund_idempotencyKeyHash_key";

-- DropIndex
DROP INDEX "EventTicket_status_usedAt_idx";

-- DropIndex
DROP INDEX "MerchantSession_hashedToken_idx";

-- AlterTable
ALTER TABLE "EventRefund" DROP COLUMN "idempotencyKeyHash";

-- AlterTable
ALTER TABLE "EventTicket" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StoreProductStat" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ProductSubscriptionOption" (
    "id" TEXT NOT NULL,
    "paymentLinkId" TEXT NOT NULL,
    "cadence" "ProductSubscriptionCadence" NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSubscriptionOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductSubscriptionOption_paymentLinkId_cadence_key" ON "ProductSubscriptionOption"("paymentLinkId", "cadence");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_hashedToken_idx" ON "EmailVerificationToken"("hashedToken");

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_createdByOpsUserId_fkey" FOREIGN KEY ("createdByOpsUserId") REFERENCES "OpsUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrder" ADD CONSTRAINT "EventOrder_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrder" ADD CONSTRAINT "EventOrder_gaPriceStageId_fkey" FOREIGN KEY ("gaPriceStageId") REFERENCES "EventPriceStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_eventOrderId_fkey" FOREIGN KEY ("eventOrderId") REFERENCES "EventOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_eventSeatId_fkey" FOREIGN KEY ("eventSeatId") REFERENCES "EventSeat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_eventPriceStageId_fkey" FOREIGN KEY ("eventPriceStageId") REFERENCES "EventPriceStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSubscriptionOption" ADD CONSTRAINT "ProductSubscriptionOption_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "IntegrationSubscriptionMapping_connectionId_externalSubscriptio" RENAME TO "IntegrationSubscriptionMapping_connectionId_externalSubscri_key";

-- RenameIndex
ALTER INDEX "IntegrationSubscriptionPlanMapping_connectionId_externalPlanCod" RENAME TO "IntegrationSubscriptionPlanMapping_connectionId_externalPla_key";

-- RenameIndex
ALTER INDEX "IntegrationSubscriptionPlanMapping_connectionId_subscriptionPla" RENAME TO "IntegrationSubscriptionPlanMapping_connectionId_subscriptio_key";
