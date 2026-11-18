-- Level 1 (no NIT): the SIN certificate of non-registration joins the CI photos and the selfie.
ALTER TYPE "KycDocumentSlot" ADD VALUE 'NIT_CERTIFICATE';

ALTER TABLE "MerchantKycSubmission" ADD COLUMN "nitCertificateDocId" TEXT;
