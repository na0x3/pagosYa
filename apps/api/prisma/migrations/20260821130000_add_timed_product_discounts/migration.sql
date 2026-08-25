ALTER TABLE "PaymentLink"
ADD COLUMN "discountPercent" INTEGER,
ADD COLUMN "discountStartsAt" TIMESTAMP(3),
ADD COLUMN "discountEndsAt" TIMESTAMP(3);

ALTER TABLE "PaymentLink"
ADD CONSTRAINT "PaymentLink_discount_schedule_check"
CHECK (
  ("discountPercent" IS NULL AND "discountStartsAt" IS NULL AND "discountEndsAt" IS NULL)
  OR
  ("discountPercent" BETWEEN 1 AND 99 AND "discountStartsAt" IS NOT NULL AND "discountEndsAt" > "discountStartsAt")
);
