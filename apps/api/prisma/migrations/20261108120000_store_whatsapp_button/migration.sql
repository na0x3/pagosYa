-- The floating WhatsApp button (owner 2026-11-08): on by default for every store with a number.
ALTER TABLE "Store" ADD COLUMN "whatsappButton" BOOLEAN NOT NULL DEFAULT true;
