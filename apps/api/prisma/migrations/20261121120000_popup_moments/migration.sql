-- Popups 2.0 part 2 (spec 2026-11-21): a popup per moment of the visit, written together as a family, and what shoppers did.
ALTER TABLE "StorePopupDesign" ADD COLUMN "moment" TEXT NOT NULL DEFAULT 'welcome';
ALTER TABLE "StorePopupDesign" ADD COLUMN "family" TEXT;
CREATE INDEX "StorePopupDesign_storeId_moment_status_idx" ON "StorePopupDesign"("storeId", "moment", "status");

CREATE TABLE "StorePopupEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "moment" TEXT NOT NULL,
    "visitor" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "step" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StorePopupEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StorePopupEvent_storeId_createdAt_idx" ON "StorePopupEvent"("storeId", "createdAt");
CREATE INDEX "StorePopupEvent_designId_kind_idx" ON "StorePopupEvent"("designId", "kind");
ALTER TABLE "StorePopupEvent" ADD CONSTRAINT "StorePopupEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
