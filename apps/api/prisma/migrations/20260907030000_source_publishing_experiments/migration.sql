ALTER TABLE "Store" ADD COLUMN "publishedSourceRevision" INTEGER, ADD COLUMN "sourcePublicationVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "sourcePublishedAt" TIMESTAMP(3);
CREATE TABLE "StoreSourceExperiment" (
 "id" TEXT NOT NULL PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "activeStoreId" TEXT, "controlRevision" INTEGER NOT NULL, "variantRevision" INTEGER NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'RUNNING', "winner" TEXT, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMP(3),
 CONSTRAINT "source_experiment_variants" CHECK ("controlRevision" <> "variantRevision"),
 CONSTRAINT "source_experiment_state" CHECK ("status" IN ('RUNNING','STOPPED','COMPLETED'))
);
CREATE UNIQUE INDEX "StoreSourceExperiment_activeStoreId_key" ON "StoreSourceExperiment"("activeStoreId");
CREATE INDEX "StoreSourceExperiment_storeId_startedAt_idx" ON "StoreSourceExperiment"("storeId","startedAt");
CREATE TABLE "StoreSourceVisit" (
 "id" TEXT NOT NULL PRIMARY KEY, "experimentId" TEXT NOT NULL REFERENCES "StoreSourceExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "visitorHash" TEXT NOT NULL, "token" TEXT NOT NULL, "variant" TEXT NOT NULL CHECK ("variant" IN ('A','B')), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "StoreSourceVisit_token_key" ON "StoreSourceVisit"("token");
CREATE UNIQUE INDEX "StoreSourceVisit_experimentId_visitorHash_key" ON "StoreSourceVisit"("experimentId","visitorHash");
CREATE INDEX "StoreSourceVisit_experimentId_variant_idx" ON "StoreSourceVisit"("experimentId","variant");
ALTER TABLE "StoreOrder" ADD COLUMN "sourceVisitId" TEXT REFERENCES "StoreSourceVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
