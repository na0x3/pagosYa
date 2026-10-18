-- Spec 2026-10-18 product link store: a listing price waiting for the merchant blocks publishing.
ALTER TABLE "PaymentLink" ADD COLUMN "priceToConfirm" BOOLEAN NOT NULL DEFAULT false;
