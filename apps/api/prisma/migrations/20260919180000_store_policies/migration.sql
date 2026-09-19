-- Merchant-authored shopper policies (returns, delivery, privacy, terms) as plain text.
ALTER TABLE "Store" ADD COLUMN "policies" JSONB NOT NULL DEFAULT '{}';
