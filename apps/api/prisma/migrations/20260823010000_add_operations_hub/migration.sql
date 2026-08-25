CREATE TABLE "BusinessCustomer" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "document" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
  "lifetimeValue" INTEGER NOT NULL DEFAULT 0,
  "orderCount" INTEGER NOT NULL DEFAULT 0,
  "lastOrderAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessCustomer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessCustomer_loyaltyPoints_check" CHECK ("loyaltyPoints" >= 0),
  CONSTRAINT "BusinessCustomer_lifetimeValue_check" CHECK ("lifetimeValue" >= 0),
  CONSTRAINT "BusinessCustomer_orderCount_check" CHECK ("orderCount" >= 0)
);

CREATE UNIQUE INDEX "BusinessCustomer_storeId_email_key" ON "BusinessCustomer"("storeId", "email");
CREATE INDEX "BusinessCustomer_merchantId_updatedAt_idx" ON "BusinessCustomer"("merchantId", "updatedAt");
CREATE INDEX "BusinessCustomer_storeId_loyaltyPoints_idx" ON "BusinessCustomer"("storeId", "loyaltyPoints");

CREATE TABLE "CustomerLoyaltyEntry" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerLoyaltyEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerLoyaltyEntry_customerId_createdAt_idx" ON "CustomerLoyaltyEntry"("customerId", "createdAt");
CREATE INDEX "CustomerLoyaltyEntry_storeId_createdAt_idx" ON "CustomerLoyaltyEntry"("storeId", "createdAt");

CREATE TABLE "MerchantAutomation" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'EMAIL',
  "delayHours" INTEGER NOT NULL DEFAULT 24,
  "subject" TEXT,
  "message" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantAutomation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MerchantAutomation_delayHours_check" CHECK ("delayHours" BETWEEN 0 AND 8760)
);
CREATE INDEX "MerchantAutomation_storeId_isActive_kind_idx" ON "MerchantAutomation"("storeId", "isActive", "kind");

CREATE TABLE "AutomationDelivery" (
  "id" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DELIVERED',
  "failureReason" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AutomationDelivery_automationId_sourceType_sourceId_key" ON "AutomationDelivery"("automationId", "sourceType", "sourceId");
CREATE INDEX "AutomationDelivery_storeId_createdAt_idx" ON "AutomationDelivery"("storeId", "createdAt");

CREATE TABLE "DeliveryZone" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fee" INTEGER NOT NULL,
  "minimumOrder" INTEGER NOT NULL DEFAULT 0,
  "radiusKm" DOUBLE PRECISION,
  "estimatedMinutes" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryZone_amounts_check" CHECK ("fee" >= 0 AND "minimumOrder" >= 0),
  CONSTRAINT "DeliveryZone_radius_check" CHECK ("radiusKm" IS NULL OR "radiusKm" > 0),
  CONSTRAINT "DeliveryZone_minutes_check" CHECK ("estimatedMinutes" IS NULL OR "estimatedMinutes" > 0)
);
CREATE UNIQUE INDEX "DeliveryZone_storeId_name_key" ON "DeliveryZone"("storeId", "name");
CREATE INDEX "DeliveryZone_storeId_isActive_idx" ON "DeliveryZone"("storeId", "isActive");

CREATE TABLE "Courier" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "vehicle" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Courier_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Courier_storeId_status_idx" ON "Courier"("storeId", "status");

CREATE TABLE "DeliveryAssignment" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "courierId" TEXT,
  "zoneId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'UNASSIGNED',
  "address" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "fee" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "estimatedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryAssignment_fee_check" CHECK ("fee" >= 0)
);
CREATE UNIQUE INDEX "DeliveryAssignment_orderId_key" ON "DeliveryAssignment"("orderId");
CREATE INDEX "DeliveryAssignment_storeId_status_createdAt_idx" ON "DeliveryAssignment"("storeId", "status", "createdAt");
CREATE INDEX "DeliveryAssignment_courierId_status_idx" ON "DeliveryAssignment"("courierId", "status");

CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Supplier_storeId_name_key" ON "Supplier"("storeId", "name");
CREATE INDEX "Supplier_storeId_updatedAt_idx" ON "Supplier"("storeId", "updatedAt");

CREATE TABLE "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'BOB',
  "expectedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "totalAmount" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseOrder_totalAmount_check" CHECK ("totalAmount" >= 0)
);
CREATE INDEX "PurchaseOrder_storeId_status_createdAt_idx" ON "PurchaseOrder"("storeId", "status", "createdAt");
CREATE INDEX "PurchaseOrder_supplierId_createdAt_idx" ON "PurchaseOrder"("supplierId", "createdAt");

CREATE TABLE "PurchaseOrderItem" (
  "id" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "paymentLinkId" TEXT,
  "sku" TEXT,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseOrderItem_quantities_check" CHECK ("quantity" > 0 AND "unitCost" >= 0 AND "receivedQuantity" >= 0 AND "receivedQuantity" <= "quantity")
);
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");
CREATE INDEX "PurchaseOrderItem_paymentLinkId_idx" ON "PurchaseOrderItem"("paymentLinkId");

CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "paymentLinkId" TEXT NOT NULL,
  "quantityDelta" INTEGER NOT NULL,
  "stockAfter" INTEGER,
  "reason" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryMovement_stockAfter_check" CHECK ("stockAfter" IS NULL OR "stockAfter" >= 0)
);
CREATE INDEX "InventoryMovement_storeId_createdAt_idx" ON "InventoryMovement"("storeId", "createdAt");
CREATE INDEX "InventoryMovement_paymentLinkId_createdAt_idx" ON "InventoryMovement"("paymentLinkId", "createdAt");

CREATE TABLE "ReconciliationImport" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BOB',
  "totalAmount" INTEGER NOT NULL,
  "matchedAmount" INTEGER NOT NULL DEFAULT 0,
  "unmatchedAmount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ReconciliationImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReconciliationImport_amounts_check" CHECK ("totalAmount" >= 0 AND "matchedAmount" >= 0 AND "unmatchedAmount" >= 0)
);
CREATE INDEX "ReconciliationImport_storeId_createdAt_idx" ON "ReconciliationImport"("storeId", "createdAt");

CREATE TABLE "ReconciliationEntry" (
  "id" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "amount" INTEGER NOT NULL,
  "description" TEXT,
  "railReference" TEXT,
  "transactionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReconciliationEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReconciliationEntry_amount_check" CHECK ("amount" >= 0)
);
CREATE UNIQUE INDEX "ReconciliationEntry_importId_externalId_key" ON "ReconciliationEntry"("importId", "externalId");
CREATE INDEX "ReconciliationEntry_importId_status_idx" ON "ReconciliationEntry"("importId", "status");
CREATE INDEX "ReconciliationEntry_railReference_idx" ON "ReconciliationEntry"("railReference");

CREATE TABLE "CustomerFavorite" (
  "id" TEXT NOT NULL,
  "consumerUserId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "paymentLinkId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerFavorite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerFavorite_consumerUserId_paymentLinkId_key" ON "CustomerFavorite"("consumerUserId", "paymentLinkId");
CREATE INDEX "CustomerFavorite_consumerUserId_createdAt_idx" ON "CustomerFavorite"("consumerUserId", "createdAt");

CREATE TABLE "CustomerReturnRequest" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "consumerUserId" TEXT,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerReturnRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerReturnRequest_storeId_status_createdAt_idx" ON "CustomerReturnRequest"("storeId", "status", "createdAt");
CREATE INDEX "CustomerReturnRequest_consumerUserId_createdAt_idx" ON "CustomerReturnRequest"("consumerUserId", "createdAt");

CREATE TABLE "PosSession" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "cashierName" TEXT NOT NULL,
  "openingFloat" INTEGER NOT NULL DEFAULT 0,
  "closingAmount" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "PosSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PosSession_amounts_check" CHECK ("openingFloat" >= 0 AND ("closingAmount" IS NULL OR "closingAmount" >= 0))
);
CREATE INDEX "PosSession_storeId_status_openedAt_idx" ON "PosSession"("storeId", "status", "openedAt");

CREATE TABLE "PosSale" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BOB',
  "items" JSONB NOT NULL,
  "customerName" TEXT,
  "customerEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PosSale_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PosSale_amount_check" CHECK ("amount" >= 0)
);
CREATE INDEX "PosSale_sessionId_createdAt_idx" ON "PosSale"("sessionId", "createdAt");
CREATE INDEX "PosSale_storeId_createdAt_idx" ON "PosSale"("storeId", "createdAt");

CREATE TABLE "IntegrationConnection" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationConnection_storeId_name_key" ON "IntegrationConnection"("storeId", "name");
CREATE INDEX "IntegrationConnection_storeId_status_kind_idx" ON "IntegrationConnection"("storeId", "status", "kind");

CREATE TABLE "IntegrationProductMapping" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "paymentLinkId" TEXT NOT NULL,
  "externalSku" TEXT NOT NULL,
  "externalName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationProductMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationProductMapping_connectionId_externalSku_key" ON "IntegrationProductMapping"("connectionId", "externalSku");
CREATE UNIQUE INDEX "IntegrationProductMapping_connectionId_paymentLinkId_key" ON "IntegrationProductMapping"("connectionId", "paymentLinkId");
CREATE INDEX "IntegrationProductMapping_paymentLinkId_idx" ON "IntegrationProductMapping"("paymentLinkId");

CREATE TABLE "IntegrationSyncRun" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "IntegrationSyncRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationSyncRun_itemCount_check" CHECK ("itemCount" >= 0)
);
CREATE INDEX "IntegrationSyncRun_connectionId_startedAt_idx" ON "IntegrationSyncRun"("connectionId", "startedAt");

CREATE TABLE "AppointmentServiceOffering" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
  "price" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'BOB',
  "color" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentServiceOffering_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppointmentServiceOffering_values_check" CHECK ("durationMinutes" BETWEEN 5 AND 1440 AND "bufferMinutes" BETWEEN 0 AND 240 AND "price" >= 0)
);
CREATE UNIQUE INDEX "AppointmentServiceOffering_storeId_name_key" ON "AppointmentServiceOffering"("storeId", "name");
CREATE INDEX "AppointmentServiceOffering_storeId_isActive_idx" ON "AppointmentServiceOffering"("storeId", "isActive");

CREATE TABLE "Appointment" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "serviceOfferingId" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "notes" TEXT,
  "depositPaymentIntentId" TEXT,
  "googleEventId" TEXT,
  "calendarSyncError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Appointment_time_check" CHECK ("endsAt" > "startsAt")
);
CREATE UNIQUE INDEX "Appointment_googleEventId_key" ON "Appointment"("googleEventId");
CREATE INDEX "Appointment_storeId_startsAt_idx" ON "Appointment"("storeId", "startsAt");
CREATE INDEX "Appointment_serviceOfferingId_startsAt_idx" ON "Appointment"("serviceOfferingId", "startsAt");

CREATE TABLE "CalendarConnection" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'GOOGLE',
  "accountEmail" TEXT,
  "calendarId" TEXT NOT NULL,
  "refreshTokenCiphertext" TEXT NOT NULL,
  "syncToken" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarConnection_storeId_key" ON "CalendarConnection"("storeId");
CREATE INDEX "CalendarConnection_merchantId_status_idx" ON "CalendarConnection"("merchantId", "status");

CREATE TABLE "CalendarOauthState" (
  "id" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarOauthState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarOauthState_stateHash_key" ON "CalendarOauthState"("stateHash");
CREATE INDEX "CalendarOauthState_expiresAt_idx" ON "CalendarOauthState"("expiresAt");

CREATE TABLE "SubscriptionPlan" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BOB',
  "interval" TEXT NOT NULL DEFAULT 'MONTHLY',
  "intervalCount" INTEGER NOT NULL DEFAULT 1,
  "collectionMode" TEXT NOT NULL DEFAULT 'MANUAL_LINK',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionPlan_values_check" CHECK ("amount" > 0 AND "intervalCount" BETWEEN 1 AND 24)
);
CREATE UNIQUE INDEX "SubscriptionPlan_storeId_name_key" ON "SubscriptionPlan"("storeId", "name");
CREATE INDEX "SubscriptionPlan_storeId_isActive_idx" ON "SubscriptionPlan"("storeId", "isActive");

CREATE TABLE "CustomerSubscription" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "customerId" TEXT,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextBillingAt" TIMESTAMP(3) NOT NULL,
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerSubscription_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerSubscription_storeId_status_nextBillingAt_idx" ON "CustomerSubscription"("storeId", "status", "nextBillingAt");
CREATE INDEX "CustomerSubscription_planId_status_idx" ON "CustomerSubscription"("planId", "status");

CREATE TABLE "SubscriptionInvoice" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BOB',
  "status" TEXT NOT NULL DEFAULT 'DUE',
  "paymentIntentId" TEXT,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionInvoice_amount_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "SubscriptionInvoice_subscriptionId_periodStart_key" ON "SubscriptionInvoice"("subscriptionId", "periodStart");
CREATE INDEX "SubscriptionInvoice_storeId_status_dueAt_idx" ON "SubscriptionInvoice"("storeId", "status", "dueAt");

ALTER TABLE "CustomerLoyaltyEntry" ADD CONSTRAINT "CustomerLoyaltyEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "BusinessCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationDelivery" ADD CONSTRAINT "AutomationDelivery_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "MerchantAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StoreOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "Courier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReconciliationEntry" ADD CONSTRAINT "ReconciliationEntry_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ReconciliationImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationEntry" ADD CONSTRAINT "ReconciliationEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerFavorite" ADD CONSTRAINT "CustomerFavorite_consumerUserId_fkey" FOREIGN KEY ("consumerUserId") REFERENCES "ConsumerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFavorite" ADD CONSTRAINT "CustomerFavorite_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerReturnRequest" ADD CONSTRAINT "CustomerReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StoreOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerReturnRequest" ADD CONSTRAINT "CustomerReturnRequest_consumerUserId_fkey" FOREIGN KEY ("consumerUserId") REFERENCES "ConsumerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PosSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationProductMapping" ADD CONSTRAINT "IntegrationProductMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationProductMapping" ADD CONSTRAINT "IntegrationProductMapping_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationSyncRun" ADD CONSTRAINT "IntegrationSyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceOfferingId_fkey" FOREIGN KEY ("serviceOfferingId") REFERENCES "AppointmentServiceOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "BusinessCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
