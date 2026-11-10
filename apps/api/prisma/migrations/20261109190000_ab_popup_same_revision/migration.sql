-- Spec 2026-11-09 YAPI A/B tests: a popup test compares two popups on the same published design, so A and B share a revision.
ALTER TABLE "StoreSourceExperiment" DROP CONSTRAINT "source_experiment_variants";
ALTER TABLE "StoreSourceExperiment" ADD CONSTRAINT "source_experiment_variants" CHECK ("kind" = 'popup' OR "controlRevision" <> "variantRevision");
