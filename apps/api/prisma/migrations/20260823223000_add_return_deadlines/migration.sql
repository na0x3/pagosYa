ALTER TABLE "CustomerReturnRequest" ADD COLUMN "dueAt" TIMESTAMP(3);

UPDATE "CustomerReturnRequest"
SET "dueAt" = "createdAt" + INTERVAL '7 days'
WHERE "dueAt" IS NULL
  AND "status" NOT IN ('REJECTED', 'REFUNDED');

CREATE INDEX "CustomerReturnRequest_storeId_status_dueAt_idx"
ON "CustomerReturnRequest"("storeId", "status", "dueAt");
