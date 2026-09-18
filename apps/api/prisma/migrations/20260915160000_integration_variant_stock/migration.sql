ALTER TABLE "IntegrationProductMapping" ADD COLUMN "variantId" TEXT;
DROP INDEX "IntegrationProductMapping_connectionId_paymentLinkId_key";
CREATE UNIQUE INDEX "IntegrationProductMapping_connectionId_paymentLinkId_variantId_key" ON "IntegrationProductMapping"("connectionId", "paymentLinkId", "variantId");
ALTER TABLE "InventoryMovement" ADD COLUMN "variantId" TEXT;
CREATE INDEX "InventoryMovement_storeId_sourceType_createdAt_idx" ON "InventoryMovement"("storeId", "sourceType", "createdAt");
ALTER TABLE "IntegrationSyncRun" ADD COLUMN "details" JSONB;
