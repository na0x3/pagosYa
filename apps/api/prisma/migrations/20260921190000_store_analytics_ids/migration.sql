-- Measurement IDs pasted by the merchant. Nullable: every existing store starts unconfigured.
ALTER TABLE "Store" ADD COLUMN "analyticsGa4Id" TEXT;
ALTER TABLE "Store" ADD COLUMN "analyticsGtmId" TEXT;
ALTER TABLE "Store" ADD COLUMN "analyticsMetaPixelId" TEXT;
ALTER TABLE "Store" ADD COLUMN "analyticsTiktokPixelId" TEXT;
