CREATE TABLE "StoreInboxThread" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "customerName" TEXT,
  "leadId" TEXT,
  "orderId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "unreadForMerchant" BOOLEAN NOT NULL DEFAULT true,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreInboxThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreInboxMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "fromEmail" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "messageId" TEXT,
  "inReplyTo" TEXT,
  "hadAttachments" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreInboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreInboxThread_storeId_customerEmail_leadId_orderId_key"
  ON "StoreInboxThread"("storeId", "customerEmail", "leadId", "orderId");
CREATE INDEX "StoreInboxThread_storeId_status_lastMessageAt_idx"
  ON "StoreInboxThread"("storeId", "status", "lastMessageAt");
CREATE UNIQUE INDEX "StoreInboxMessage_messageId_key" ON "StoreInboxMessage"("messageId");
CREATE INDEX "StoreInboxMessage_threadId_createdAt_idx" ON "StoreInboxMessage"("threadId", "createdAt");
CREATE INDEX "StoreInboxMessage_inReplyTo_idx" ON "StoreInboxMessage"("inReplyTo");

ALTER TABLE "StoreInboxThread" ADD CONSTRAINT "StoreInboxThread_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreInboxMessage" ADD CONSTRAINT "StoreInboxMessage_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "StoreInboxThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
