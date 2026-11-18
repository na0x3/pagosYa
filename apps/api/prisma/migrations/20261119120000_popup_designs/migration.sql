-- Popups 2.0 part 1 (spec 2026-11-18): YAPI-written popup designs, and the design a signup or a code came from.
CREATE TYPE "PopupDesignStatus" AS ENUM ('DRAFT', 'LIVE', 'FAILED', 'RETIRED');

CREATE TABLE "StorePopupDesign" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PopupDesignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "request" TEXT,
    "flow" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "css" TEXT NOT NULL,
    "launcher" TEXT,
    "capture" TEXT NOT NULL DEFAULT 'whatsapp',
    "percent" INTEGER NOT NULL DEFAULT 10,
    "composition" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "checks" JSONB,
    "previews" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StorePopupDesign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StorePopupDesign_storeId_version_key" ON "StorePopupDesign"("storeId", "version");
CREATE INDEX "StorePopupDesign_storeId_status_idx" ON "StorePopupDesign"("storeId", "status");
CREATE INDEX "StorePopupDesign_createdAt_idx" ON "StorePopupDesign"("createdAt");
ALTER TABLE "StorePopupDesign" ADD CONSTRAINT "StorePopupDesign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoreNewsletterSubscriber" ADD COLUMN "popupDesignId" TEXT;
CREATE INDEX "StoreNewsletterSubscriber_popupDesignId_idx" ON "StoreNewsletterSubscriber"("popupDesignId");
ALTER TABLE "StoreWhatsappSubscriber" ADD COLUMN "popupDesignId" TEXT;
CREATE INDEX "StoreWhatsappSubscriber_popupDesignId_idx" ON "StoreWhatsappSubscriber"("popupDesignId");
ALTER TABLE "PromoCode" ADD COLUMN "popupDesignId" TEXT;
CREATE INDEX "PromoCode_popupDesignId_idx" ON "PromoCode"("popupDesignId");
