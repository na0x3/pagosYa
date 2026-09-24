-- Lets a queued email name its own Reply-To. Staff order notifications point at
-- the buyer so the merchant can answer straight from their inbox.
ALTER TABLE "StoreEmailDelivery" ADD COLUMN "replyTo" TEXT;
