-- Lets a queued email carry its own RFC 5322 Message-ID. Inbox replies set it
-- so the shopper's answer comes back with In-Reply-To pointing at the
-- StoreInboxMessage row that has the same id, which is how a reply is filed
-- back into its own conversation. Stored without angle brackets; the sender
-- wraps the value when it builds the header.
ALTER TABLE "StoreEmailDelivery" ADD COLUMN "messageIdHeader" TEXT;
