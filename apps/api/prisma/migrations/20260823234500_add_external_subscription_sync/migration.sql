ALTER TABLE "CustomerSubscription"
  ADD COLUMN "amountOverride" INTEGER;

ALTER TABLE "CustomerSubscription"
  ADD CONSTRAINT "CustomerSubscription_amountOverride_check"
  CHECK ("amountOverride" IS NULL OR "amountOverride" > 0);

CREATE TABLE "IntegrationSubscriptionPlanMapping" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "subscriptionPlanId" TEXT NOT NULL,
  "externalPlanCode" TEXT NOT NULL,
  "externalName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationSubscriptionPlanMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationSubscriptionPlanMapping_connectionId_externalPlanCode_key"
  ON "IntegrationSubscriptionPlanMapping"("connectionId", "externalPlanCode");
CREATE UNIQUE INDEX "IntegrationSubscriptionPlanMapping_connectionId_subscriptionPlanId_key"
  ON "IntegrationSubscriptionPlanMapping"("connectionId", "subscriptionPlanId");
CREATE INDEX "IntegrationSubscriptionPlanMapping_subscriptionPlanId_idx"
  ON "IntegrationSubscriptionPlanMapping"("subscriptionPlanId");

CREATE TABLE "IntegrationCustomerMapping" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "businessCustomerId" TEXT NOT NULL,
  "externalCustomerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationCustomerMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationCustomerMapping_connectionId_externalCustomerId_key"
  ON "IntegrationCustomerMapping"("connectionId", "externalCustomerId");
CREATE INDEX "IntegrationCustomerMapping_businessCustomerId_idx"
  ON "IntegrationCustomerMapping"("businessCustomerId");

CREATE TABLE "IntegrationSubscriptionMapping" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "customerSubscriptionId" TEXT NOT NULL,
  "externalSubscriptionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationSubscriptionMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationSubscriptionMapping_customerSubscriptionId_key"
  ON "IntegrationSubscriptionMapping"("customerSubscriptionId");
CREATE UNIQUE INDEX "IntegrationSubscriptionMapping_connectionId_externalSubscriptionId_key"
  ON "IntegrationSubscriptionMapping"("connectionId", "externalSubscriptionId");
CREATE INDEX "IntegrationSubscriptionMapping_connectionId_idx"
  ON "IntegrationSubscriptionMapping"("connectionId");
