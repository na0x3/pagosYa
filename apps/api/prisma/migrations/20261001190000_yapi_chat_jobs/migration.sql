CREATE TABLE "StoreSourceChatJob" (
 "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "merchantId" TEXT NOT NULL,
 "requestId" TEXT NOT NULL, "inputDigest" TEXT NOT NULL, "input" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUEUED', "activeStoreId" TEXT,
 "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3),
 "attempt" INTEGER NOT NULL DEFAULT 0, "sequence" INTEGER NOT NULL DEFAULT 0,
 "result" JSONB, "error" TEXT, "lastCommittedRevision" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "StoreSourceChatJob_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "StoreSourceChatJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StoreSourceChatJob_activeStoreId_key" ON "StoreSourceChatJob"("activeStoreId");
CREATE UNIQUE INDEX "StoreSourceChatJob_storeId_requestId_key" ON "StoreSourceChatJob"("storeId", "requestId");
CREATE INDEX "StoreSourceChatJob_status_leaseUntil_createdAt_idx" ON "StoreSourceChatJob"("status", "leaseUntil", "createdAt");
