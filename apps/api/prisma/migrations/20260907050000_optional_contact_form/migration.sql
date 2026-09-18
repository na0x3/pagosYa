ALTER TABLE "Store" ALTER COLUMN "contactFormEnabled" SET DEFAULT false;
ALTER TABLE "Store" ADD COLUMN "sourcePublicationPaused" BOOLEAN NOT NULL DEFAULT false;
