CREATE TYPE "ConsumerAffiliationStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "OrderFulfillmentStatus" AS ENUM ('AWAITING_PAYMENT', 'PAID', 'PREPARING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED', 'CANCELED', 'REFUNDED');

CREATE TABLE "ConsumerUser" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "carnet" TEXT NOT NULL,
  "hashedPassword" TEXT NOT NULL,
  "emailVerifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsumerUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsumerSession" (
  "id" TEXT NOT NULL,
  "consumerUserId" TEXT NOT NULL,
  "hashedToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsumerVerificationToken" (
  "id" TEXT NOT NULL,
  "consumerUserId" TEXT NOT NULL,
  "hashedToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsumerInstitutionAffiliation" (
  "id" TEXT NOT NULL,
  "consumerUserId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "status" "ConsumerAffiliationStatus" NOT NULL DEFAULT 'ACTIVE',
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "ConsumerInstitutionAffiliation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreOrder" (
  "id" TEXT NOT NULL,
  "paymentIntentId" TEXT NOT NULL,
  "consumerUserId" TEXT,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "storeName" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BOB',
  "status" "OrderFulfillmentStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreOrderStatusEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "OrderFulfillmentStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreOrderStatusEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentIntent" ADD COLUMN "consumerUserId" TEXT;

CREATE UNIQUE INDEX "ConsumerUser_email_key" ON "ConsumerUser"("email");
CREATE UNIQUE INDEX "ConsumerUser_carnet_key" ON "ConsumerUser"("carnet");
CREATE UNIQUE INDEX "ConsumerSession_hashedToken_key" ON "ConsumerSession"("hashedToken");
CREATE INDEX "ConsumerSession_consumerUserId_expiresAt_idx" ON "ConsumerSession"("consumerUserId", "expiresAt");
CREATE INDEX "ConsumerVerificationToken_expiresAt_idx" ON "ConsumerVerificationToken"("expiresAt");
CREATE UNIQUE INDEX "ConsumerInstitutionAffiliation_consumerUserId_storeId_key" ON "ConsumerInstitutionAffiliation"("consumerUserId", "storeId");
CREATE INDEX "ConsumerInstitutionAffiliation_storeId_status_idx" ON "ConsumerInstitutionAffiliation"("storeId", "status");
CREATE UNIQUE INDEX "StoreOrder_paymentIntentId_key" ON "StoreOrder"("paymentIntentId");
CREATE INDEX "StoreOrder_consumerUserId_createdAt_idx" ON "StoreOrder"("consumerUserId", "createdAt");
CREATE INDEX "StoreOrder_merchantId_createdAt_idx" ON "StoreOrder"("merchantId", "createdAt");
CREATE INDEX "StoreOrder_storeId_createdAt_idx" ON "StoreOrder"("storeId", "createdAt");
CREATE INDEX "StoreOrderStatusEvent_orderId_createdAt_idx" ON "StoreOrderStatusEvent"("orderId", "createdAt");
CREATE INDEX "PaymentIntent_consumerUserId_createdAt_idx" ON "PaymentIntent"("consumerUserId", "createdAt");

ALTER TABLE "ConsumerSession" ADD CONSTRAINT "ConsumerSession_consumerUserId_fkey" FOREIGN KEY ("consumerUserId") REFERENCES "ConsumerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsumerVerificationToken" ADD CONSTRAINT "ConsumerVerificationToken_consumerUserId_fkey" FOREIGN KEY ("consumerUserId") REFERENCES "ConsumerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsumerInstitutionAffiliation" ADD CONSTRAINT "ConsumerInstitutionAffiliation_consumerUserId_fkey" FOREIGN KEY ("consumerUserId") REFERENCES "ConsumerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsumerInstitutionAffiliation" ADD CONSTRAINT "ConsumerInstitutionAffiliation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_consumerUserId_fkey" FOREIGN KEY ("consumerUserId") REFERENCES "ConsumerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_consumerUserId_fkey" FOREIGN KEY ("consumerUserId") REFERENCES "ConsumerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreOrderStatusEvent" ADD CONSTRAINT "StoreOrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StoreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
