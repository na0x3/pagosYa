-- AlterTable
ALTER TABLE "EventRefund" ADD COLUMN "idempotencyKeyHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EventRefund_idempotencyKeyHash_key" ON "EventRefund"("idempotencyKeyHash");
