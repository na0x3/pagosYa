-- Spec 2026-11-10 rasca y elige: the favourite a popup signup chose, and popup signups by WhatsApp.
ALTER TABLE "StoreNewsletterSubscriber" ADD COLUMN "favourite" TEXT;

CREATE TABLE "StoreWhatsappSubscriber" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "favourite" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceVisitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreWhatsappSubscriber_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreWhatsappSubscriber_storeId_phone_key" ON "StoreWhatsappSubscriber"("storeId", "phone");
CREATE INDEX "StoreWhatsappSubscriber_storeId_createdAt_idx" ON "StoreWhatsappSubscriber"("storeId", "createdAt");
ALTER TABLE "StoreWhatsappSubscriber" ADD CONSTRAINT "StoreWhatsappSubscriber_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
