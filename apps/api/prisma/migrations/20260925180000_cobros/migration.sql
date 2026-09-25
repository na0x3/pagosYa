-- Cobros (D1): only the D0 BusinessDocument table changes.
ALTER TABLE "BusinessDocument" ADD COLUMN "paymentIntentId" TEXT,
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "autoReminders" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "BusinessDocument_paymentIntentId_idx" ON "BusinessDocument"("paymentIntentId");

-- CreateIndex
CREATE INDEX "BusinessDocument_kind_status_dueAt_idx" ON "BusinessDocument"("kind", "status", "dueAt");
