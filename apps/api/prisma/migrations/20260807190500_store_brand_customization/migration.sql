-- Store brand customization: long-form brand story, custom accent color,
-- button corner style, announcement bar, and merchant-defined link buttons.
-- Purely additive — every existing store keeps rendering exactly as before
-- (all new columns nullable except buttonStyle, which defaults to the
-- current look).

ALTER TABLE "Store"
  ADD COLUMN "aboutText" TEXT,
  ADD COLUMN "accentColor" TEXT,
  ADD COLUMN "buttonStyle" TEXT NOT NULL DEFAULT 'rounded',
  ADD COLUMN "announcement" TEXT;

CREATE TABLE "StoreLink" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "StoreLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoreLink_storeId_sortOrder_idx" ON "StoreLink"("storeId", "sortOrder");

ALTER TABLE "StoreLink"
  ADD CONSTRAINT "StoreLink_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
