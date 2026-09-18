ALTER TABLE "StoreSourceDesignJob" ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "StoreSourceDesignJob_status_availableAt_idx" ON "StoreSourceDesignJob"("status", "availableAt");
