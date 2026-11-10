-- Spec 2026-11-09 YAPI A/B tests: popup tests (kind + B's popup + B's code), the merchant's words, notes, extension, and the visit a
-- new signup came from.
ALTER TABLE "StoreSourceExperiment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'design';
ALTER TABLE "StoreSourceExperiment" ADD COLUMN "variantSettings" JSONB;
ALTER TABLE "StoreSourceExperiment" ADD COLUMN "variantPromoCodeId" TEXT;
ALTER TABLE "StoreSourceExperiment" ADD COLUMN "request" TEXT;
ALTER TABLE "StoreSourceExperiment" ADD COLUMN "lastNoteAt" TIMESTAMP(3);
ALTER TABLE "StoreSourceExperiment" ADD COLUMN "extendedUntil" TIMESTAMP(3);
ALTER TABLE "StoreNewsletterSubscriber" ADD COLUMN "sourceVisitId" TEXT;
CREATE INDEX "StoreNewsletterSubscriber_sourceVisitId_idx" ON "StoreNewsletterSubscriber"("sourceVisitId");
ALTER TABLE "StoreNewsletterSubscriber" ADD CONSTRAINT "StoreNewsletterSubscriber_sourceVisitId_fkey" FOREIGN KEY ("sourceVisitId") REFERENCES "StoreSourceVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
