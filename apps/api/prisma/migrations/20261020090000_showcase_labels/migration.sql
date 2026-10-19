-- Showcase commerce 2026-10-19: pack and subscription labels («Recomendado»), card eyebrow phrase.
ALTER TABLE "StoreBundle" ADD COLUMN "label" TEXT;
ALTER TABLE "ProductSubscriptionOption" ADD COLUMN "label" TEXT;
ALTER TABLE "PaymentLink" ADD COLUMN "cardEyebrow" TEXT;
