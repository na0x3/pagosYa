-- «La tienda que vende sola» (spec 2026-11-16): a selling test compares two sets of selling switches on the same published design.
ALTER TABLE "StoreSourceExperiment" DROP CONSTRAINT "source_experiment_variants";
ALTER TABLE "StoreSourceExperiment" ADD CONSTRAINT "source_experiment_variants" CHECK ("kind" IN ('popup', 'selling') OR "controlRevision" <> "variantRevision");
