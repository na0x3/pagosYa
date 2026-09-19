ALTER TABLE "Store" ADD COLUMN "publicVisibility" BOOLEAN NOT NULL DEFAULT false;

-- Preserve every currently served store, including legacy sites without source revisions.
UPDATE "Store"
SET "publicVisibility" = true
WHERE "status" = 'ACTIVE' AND "sourcePublicationPaused" = false;
