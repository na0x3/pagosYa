-- Sanctions screening at KYC (UIF / BCB R.D. 079/2022): UN + OFAC lists, a screening per submission, PEP self-declaration.
CREATE TYPE "SanctionsSource" AS ENUM ('UN', 'OFAC');
CREATE TYPE "KycScreeningStatus" AS ENUM ('CLEAR', 'POSSIBLE_MATCH', 'DISMISSED', 'CONFIRMED', 'NOT_SCREENED');

ALTER TABLE "MerchantKycSubmission" ADD COLUMN "isPep" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MerchantKycSubmission" ADD COLUMN "pepRole" TEXT;

CREATE TABLE "SanctionsEntry" (
    "id" TEXT NOT NULL,
    "source" "SanctionsSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "primaryName" TEXT NOT NULL,
    "names" TEXT[],
    "birthDates" TEXT[],
    "nationalities" TEXT[],
    "programs" TEXT[],
    "listedOn" TEXT,
    "importId" TEXT NOT NULL,
    CONSTRAINT "SanctionsEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SanctionsEntry_source_externalId_key" ON "SanctionsEntry"("source", "externalId");
CREATE INDEX "SanctionsEntry_source_idx" ON "SanctionsEntry"("source");

CREATE TABLE "SanctionsListImport" (
    "id" TEXT NOT NULL,
    "source" "SanctionsSource" NOT NULL,
    "entries" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "publishedAt" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SanctionsListImport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SanctionsListImport_source_importedAt_idx" ON "SanctionsListImport"("source", "importedAt");

CREATE TABLE "KycScreening" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "screenedNames" TEXT[],
    "status" "KycScreeningStatus" NOT NULL,
    "matches" JSONB NOT NULL,
    "listImports" JSONB NOT NULL,
    "trigger" TEXT NOT NULL,
    "resolvedByOpsUserId" TEXT,
    "resolvedByLabel" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KycScreening_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "KycScreening_submissionId_createdAt_idx" ON "KycScreening"("submissionId", "createdAt");
CREATE INDEX "KycScreening_status_idx" ON "KycScreening"("status");
ALTER TABLE "KycScreening" ADD CONSTRAINT "KycScreening_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "MerchantKycSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
