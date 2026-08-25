ALTER TABLE "SubscriptionPlan"
  ADD COLUMN "reminderHoursBefore" INTEGER NOT NULL DEFAULT 24;

ALTER TABLE "CustomerSubscription"
  ADD COLUMN "nextAmountOverride" INTEGER,
  ADD COLUMN "activeKey" TEXT;

ALTER TABLE "SubscriptionInvoice"
  ADD COLUMN "initialNoticeAt" TIMESTAMP(3),
  ADD COLUMN "lastReminderAt" TIMESTAMP(3),
  ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SubscriptionPlan"
  ADD CONSTRAINT "SubscriptionPlan_reminderHoursBefore_check"
  CHECK ("reminderHoursBefore" BETWEEN 0 AND 720);

ALTER TABLE "CustomerSubscription"
  ADD CONSTRAINT "CustomerSubscription_nextAmountOverride_check"
  CHECK ("nextAmountOverride" IS NULL OR "nextAmountOverride" > 0);

CREATE UNIQUE INDEX "CustomerSubscription_activeKey_key"
  ON "CustomerSubscription"("activeKey");

ALTER TABLE "Appointment"
  ADD COLUMN "holdExpiresAt" TIMESTAMP(3);

CREATE INDEX "Appointment_storeId_status_holdExpiresAt_idx"
  ON "Appointment"("storeId", "status", "holdExpiresAt");
