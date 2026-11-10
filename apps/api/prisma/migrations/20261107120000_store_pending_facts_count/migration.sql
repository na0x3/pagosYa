-- Mi tienda (2026-11-07): the pending assumed-facts count of each store, kept for the revision it was made for, so the store list
-- no longer reads every store's whole snapshot. Additive and nullable: a null count is made on the next read.
ALTER TABLE "StoreSourceProject" ADD COLUMN "pendingFacts" INTEGER;
ALTER TABLE "StoreSourceProject" ADD COLUMN "pendingFactsRevision" INTEGER;
