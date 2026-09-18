-- CreateEnum
CREATE TYPE "CarrierMode" AS ENUM ('API', 'MANUAL');

-- CreateEnum
CREATE TYPE "CarrierAccountType" AS ENUM ('MERCHANT', 'PLATFORM');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('BOOKING', 'BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ShipmentChargeKind" AS ENUM ('SURCHARGE', 'CANCELLATION_FEE', 'CREDIT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerAccount" ADD VALUE 'SHIPPING_CLEARING';
ALTER TYPE "LedgerAccount" ADD VALUE 'COURIER_PAYABLE';

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "shippingCarriersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shippingPrepMinutes" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "StoreOrder" ADD COLUMN     "recipientName" TEXT,
ADD COLUMN     "recipientPhone" TEXT,
ADD COLUMN     "shippingCity" TEXT,
ADD COLUMN     "shippingDepartment" TEXT,
ADD COLUMN     "shippingLat" DOUBLE PRECISION,
ADD COLUMN     "shippingLng" DOUBLE PRECISION,
ADD COLUMN     "shippingReferences" TEXT,
ADD COLUMN     "shippingStreet" TEXT;

-- AlterTable
ALTER TABLE "DeliveryZone" ADD COLUMN     "carrierId" TEXT,
ADD COLUMN     "departments" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ShippingCarrier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "CarrierMode" NOT NULL,
    "trackingUrlTemplate" TEXT,
    "platformEnabled" BOOLEAN NOT NULL DEFAULT false,
    "platformMarginBps" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingCarrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreCarrierAccount" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "accountType" "CarrierAccountType" NOT NULL DEFAULT 'MERCHANT',
    "credentialsCiphertext" TEXT,
    "credentialsHint" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreCarrierAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "accountType" "CarrierAccountType" NOT NULL DEFAULT 'MERCHANT',
    "quoteId" TEXT,
    "quotedAmount" INTEGER NOT NULL,
    "marginAmount" INTEGER NOT NULL DEFAULT 0,
    "actualCost" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'BOB',
    "status" "ShipmentStatus" NOT NULL DEFAULT 'BOOKING',
    "trackingNumber" TEXT,
    "carrierRef" TEXT,
    "labelFileId" TEXT,
    "pickupScheduledAt" TIMESTAMP(3),
    "bookingAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "bookedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "carrierEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentCharge" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "kind" "ShipmentChargeKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ledgerGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShippingCarrier_code_key" ON "ShippingCarrier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StoreCarrierAccount_storeId_carrierId_key" ON "StoreCarrierAccount"("storeId", "carrierId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_status_nextAttemptAt_idx" ON "Shipment"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Shipment_storeId_status_createdAt_idx" ON "Shipment"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx" ON "ShipmentEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentEvent_shipmentId_carrierEventId_key" ON "ShipmentEvent"("shipmentId", "carrierEventId");

-- CreateIndex
CREATE INDEX "ShipmentCharge_shipmentId_idx" ON "ShipmentCharge"("shipmentId");

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "ShippingCarrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCarrierAccount" ADD CONSTRAINT "StoreCarrierAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCarrierAccount" ADD CONSTRAINT "StoreCarrierAccount_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "ShippingCarrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StoreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "ShippingCarrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentCharge" ADD CONSTRAINT "ShipmentCharge_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ShippingCarrier" ("id","code","name","mode","trackingUrlTemplate","updatedAt") VALUES
  ('car_dhl_express','dhl_express','DHL Express','API','https://www.dhl.com/bo-es/home/tracking.html?tracking-id={tracking}',NOW()),
  ('car_patio','patio','Patio Service','API',NULL,NOW()),
  ('car_uber_direct','uber_direct','Uber Direct','API',NULL,NOW()),
  ('car_servientrega','servientrega','Servientrega Bolivia','MANUAL',NULL,NOW()),
  ('car_ocs','ocs','OCS Bolivia','MANUAL',NULL,NOW()),
  ('car_boa_cargo','boa_cargo','BoA Cargo','MANUAL',NULL,NOW()),
  ('car_correos_bo','correos_bo','Correos de Bolivia','MANUAL',NULL,NOW()),
  ('car_pakex','pakex','Pakex','MANUAL',NULL,NOW()),
  ('car_bc_plus','bc_plus','BC Plus Courier','MANUAL',NULL,NOW()),
  ('car_cargo_express','cargo_express','Cargo Express','MANUAL',NULL,NOW()),
  ('car_other','other','Otro courier','MANUAL',NULL,NOW());
-- API carriers stay inactive until their adapters ship (Phase 2/3).
UPDATE "ShippingCarrier" SET "isActive" = false WHERE "mode" = 'API';

