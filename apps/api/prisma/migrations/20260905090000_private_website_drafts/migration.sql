ALTER TABLE "Store" ADD COLUMN "websiteDraft" JSONB,
  ADD COLUMN "websiteRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "websitePublishedRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StoreVisualProposal" ADD COLUMN "baseWebsiteRevision" INTEGER;
