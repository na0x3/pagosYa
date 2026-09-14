CREATE TABLE "StoreSourceDesignJob" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "activeStoreId" TEXT,
  "revision" INTEGER NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "contextDigest" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "stage" TEXT NOT NULL DEFAULT 'CAPTURE_BASELINE',
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
  "maxCredits" INTEGER NOT NULL,
  "reservedMicroUsd" INTEGER NOT NULL DEFAULT 0,
  "settledMicroUsd" INTEGER NOT NULL DEFAULT 0,
  "repairs" INTEGER NOT NULL DEFAULT 0,
  "input" JSONB NOT NULL,
  "checkpoints" JSONB NOT NULL DEFAULT '{}',
  "receipts" JSONB NOT NULL DEFAULT '[]',
  "error" TEXT,
  "resultRevision" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreSourceDesignJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreSourceDesignJob_budget_check" CHECK ("maxCredits" BETWEEN 1 AND 500 AND "reservedMicroUsd" >= 0 AND "settledMicroUsd" >= 0),
  CONSTRAINT "StoreSourceDesignJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StoreSourceDesignJob_activeStoreId_key" ON "StoreSourceDesignJob"("activeStoreId");
CREATE UNIQUE INDEX "StoreSourceDesignJob_storeId_requestId_key" ON "StoreSourceDesignJob"("storeId", "requestId");
CREATE INDEX "StoreSourceDesignJob_status_createdAt_idx" ON "StoreSourceDesignJob"("status", "createdAt");
CREATE INDEX "StoreSourceDesignJob_storeId_createdAt_idx" ON "StoreSourceDesignJob"("storeId", "createdAt");
CREATE TABLE "StoreSourceDesignArtifact" (
  "jobId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "digest" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreSourceDesignArtifact_pkey" PRIMARY KEY ("jobId", "key"),
  CONSTRAINT "StoreSourceDesignArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "StoreSourceDesignJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
