-- PagosYa owns reusable biometric identities centrally. Event terminals keep
-- temporary, event-scoped copies represented by DevicePersonMapping.

CREATE TYPE "BiometricProvider" AS ENUM ('MOCK', 'ZKTECO', 'FUTURE_PROVIDER');
CREATE TYPE "BiometricIdentityStatus" AS ENUM ('ACTIVE', 'REVOKED', 'DELETED', 'REQUIRES_REENROLLMENT');
CREATE TYPE "BiometricConsentScope" AS ENUM ('EVENT_ONLY', 'REUSABLE');
CREATE TYPE "BiometricReenrollmentReason" AS ENUM ('ALGORITHM_INCOMPATIBLE', 'POOR_ENROLLMENT', 'CREDENTIAL_CORRUPT', 'CUSTOMER_REQUESTED', 'VENDOR_MIGRATION', 'CONSENT_CHANGED');
CREATE TYPE "EventBiometricAuthorizationStatus" AS ENUM ('AUTHORIZED', 'REVOKED', 'EXPIRED');
CREATE TYPE "DevicePersonSyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'REMOVAL_PENDING', 'REMOVED');

CREATE TABLE "BiometricIdentity" (
    "id" TEXT NOT NULL,
    "consumerUserId" TEXT,
    "provider" "BiometricProvider" NOT NULL,
    "status" "BiometricIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "reusableAcrossEvents" BOOLEAN NOT NULL DEFAULT false,
    "activeConsentId" TEXT,
    "providerExternalId" TEXT,
    "algorithmVersion" TEXT,
    "encryptedVendorPayload" TEXT,
    "encryptedTemplateReference" TEXT,
    "metadata" JSONB,
    "lastVerifiedAt" TIMESTAMP(3),
    "reenrollmentReason" "BiometricReenrollmentReason",
    "revokedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BiometricIdentity_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AccessDevice"
  ADD COLUMN "algorithmVersion" TEXT,
  ADD COLUMN "faceCapacity" INTEGER,
  ADD COLUMN "providerCapabilities" JSONB;

ALTER TABLE "Attendee" ADD COLUMN "consumerUserId" TEXT;

ALTER TABLE "BiometricConsent"
  ADD COLUMN "biometricIdentityId" TEXT,
  ADD COLUMN "consumerUserId" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "scope" "BiometricConsentScope" NOT NULL DEFAULT 'EVENT_ONLY',
  ALTER COLUMN "retentionUntil" DROP NOT NULL;

ALTER TABLE "EnrollmentSession"
  ADD COLUMN "consumerUserId" TEXT,
  ADD COLUMN "requestedScope" "BiometricConsentScope" NOT NULL DEFAULT 'EVENT_ONLY';

-- Preserve every legacy admission-bound credential as a non-reusable central
-- identity. A customer must explicitly opt in before an identity is reusable.
INSERT INTO "BiometricIdentity" (
  "id", "provider", "providerExternalId", "status", "reusableAcrossEvents",
  "metadata", "lastVerifiedAt", "createdAt", "updatedAt", "deletedAt"
)
SELECT
  'legacy-bio-' || c."id",
  CASE WHEN lower(c."provider") = 'mock' THEN 'MOCK'::"BiometricProvider" ELSE 'ZKTECO'::"BiometricProvider" END,
  c."externalCredentialId",
  CASE WHEN c."deletedAt" IS NULL THEN 'ACTIVE'::"BiometricIdentityStatus" ELSE 'DELETED'::"BiometricIdentityStatus" END,
  false,
  jsonb_build_object('migratedFromAdmissionCredential', true),
  c."enrolledAt",
  c."createdAt",
  c."updatedAt",
  c."deletedAt"
FROM "BiometricCredential" c;

-- Defensive backfill for any credential that was created without a consent.
INSERT INTO "BiometricConsent" (
  "id", "eventId", "attendeeId", "admissionId", "version", "purpose",
  "consentedAt", "retentionUntil", "createdAt", "scope", "biometricIdentityId"
)
SELECT
  'legacy-consent-' || c."id", c."eventId", c."attendeeId", c."admissionId",
  'legacy-events-biometric-v1', 'Legacy event access consent', c."enrolledAt",
  c."retentionUntil", c."createdAt", 'EVENT_ONLY', 'legacy-bio-' || c."id"
FROM (
  SELECT DISTINCT ON (credential."admissionId") credential.*
  FROM "BiometricCredential" credential
  ORDER BY credential."admissionId", (credential."deletedAt" IS NULL) DESC,
    credential."enrolledAt" DESC, credential."createdAt" DESC, credential."id" DESC
) c
WHERE NOT EXISTS (
  SELECT 1 FROM "BiometricConsent" consent WHERE consent."admissionId" = c."admissionId"
);

UPDATE "BiometricConsent" consent
SET "biometricIdentityId" = 'legacy-bio-' || (
  SELECT credential."id"
  FROM "BiometricCredential" credential
  WHERE credential."admissionId" = consent."admissionId"
  ORDER BY (credential."deletedAt" IS NULL) DESC, credential."enrolledAt" DESC,
    credential."createdAt" DESC, credential."id" DESC
  LIMIT 1
)
WHERE consent."biometricIdentityId" IS NULL;

UPDATE "BiometricIdentity" identity
SET "activeConsentId" = consent."id"
FROM "BiometricCredential" credential
JOIN LATERAL (
  SELECT c."id"
  FROM "BiometricConsent" c
  WHERE c."admissionId" = credential."admissionId"
  ORDER BY c."consentedAt" DESC
  LIMIT 1
) consent ON true
WHERE identity."id" = 'legacy-bio-' || credential."id"
  AND credential."id" = (
    SELECT selected."id"
    FROM "BiometricCredential" selected
    WHERE selected."admissionId" = credential."admissionId"
    ORDER BY (selected."deletedAt" IS NULL) DESC, selected."enrolledAt" DESC,
      selected."createdAt" DESC, selected."id" DESC
    LIMIT 1
  );

CREATE TABLE "EventBiometricAuthorization" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "biometricIdentityId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "status" "EventBiometricAuthorizationStatus" NOT NULL DEFAULT 'AUTHORIZED',
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventBiometricAuthorization_pkey" PRIMARY KEY ("id")
);

INSERT INTO "EventBiometricAuthorization" (
  "id", "eventId", "admissionId", "attendeeId", "biometricIdentityId",
  "consentId", "status", "authorizedAt", "revokedAt", "createdAt", "updatedAt"
)
SELECT
  'legacy-auth-' || credential."id", credential."eventId", credential."admissionId",
  credential."attendeeId", 'legacy-bio-' || credential."id", consent."id",
  CASE WHEN credential."deletedAt" IS NULL THEN 'AUTHORIZED'::"EventBiometricAuthorizationStatus" ELSE 'REVOKED'::"EventBiometricAuthorizationStatus" END,
  credential."enrolledAt", credential."deletedAt", credential."createdAt", credential."updatedAt"
FROM (
  SELECT DISTINCT ON (candidate."admissionId") candidate.*
  FROM "BiometricCredential" candidate
  ORDER BY candidate."admissionId", (candidate."deletedAt" IS NULL) DESC,
    candidate."enrolledAt" DESC, candidate."createdAt" DESC, candidate."id" DESC
) credential
JOIN LATERAL (
  SELECT c."id"
  FROM "BiometricConsent" c
  WHERE c."admissionId" = credential."admissionId"
  ORDER BY c."consentedAt" DESC
  LIMIT 1
) consent ON true;

ALTER TABLE "BiometricCredential"
  ADD COLUMN "algorithmVersion" TEXT,
  ADD COLUMN "biometricIdentityId" TEXT,
  ADD COLUMN "encryptedTemplateReference" TEXT,
  ADD COLUMN "encryptedVendorPayload" TEXT,
  ADD COLUMN "lastVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "providerExternalId" TEXT,
  ADD COLUMN "providerV2" "BiometricProvider";

UPDATE "BiometricCredential"
SET "biometricIdentityId" = 'legacy-bio-' || "id",
    "providerExternalId" = "externalCredentialId",
    "providerV2" = CASE WHEN lower("provider") = 'mock' THEN 'MOCK'::"BiometricProvider" ELSE 'ZKTECO'::"BiometricProvider" END,
    "lastVerifiedAt" = "enrolledAt";

ALTER TABLE "DevicePersonMapping"
  ADD COLUMN "algorithmVersion" TEXT,
  ADD COLUMN "biometricIdentityId" TEXT,
  ADD COLUMN "contentFingerprint" TEXT,
  ADD COLUMN "lastAttemptedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "removedAt" TIMESTAMP(3),
  ADD COLUMN "syncStatus" "DevicePersonSyncStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "syncedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "DevicePersonMapping" mapping
SET "biometricIdentityId" = credential."biometricIdentityId",
    "syncStatus" = CASE WHEN mapping."deletedAt" IS NULL THEN 'SYNCED'::"DevicePersonSyncStatus" ELSE 'REMOVED'::"DevicePersonSyncStatus" END,
    "syncedAt" = CASE WHEN mapping."deletedAt" IS NULL THEN mapping."createdAt" ELSE NULL END,
    "removedAt" = mapping."deletedAt"
FROM "BiometricCredential" credential
WHERE credential."id" = mapping."credentialId";

ALTER TABLE "BiometricDeletionJob"
  ADD COLUMN "biometricIdentityId" TEXT,
  ADD COLUMN "reason" TEXT NOT NULL DEFAULT 'LEGACY_DELETION_REQUEST';

UPDATE "BiometricDeletionJob" job
SET "biometricIdentityId" = credential."biometricIdentityId"
FROM "BiometricCredential" credential
WHERE credential."id" = job."credentialId";

ALTER TABLE "BiometricCredential" DROP CONSTRAINT "BiometricCredential_admissionId_fkey";
ALTER TABLE "BiometricCredential" DROP CONSTRAINT "BiometricCredential_attendeeId_fkey";
ALTER TABLE "BiometricCredential" DROP CONSTRAINT "BiometricCredential_eventId_fkey";
ALTER TABLE "DevicePersonMapping" DROP CONSTRAINT "DevicePersonMapping_attendeeId_fkey";
ALTER TABLE "DevicePersonMapping" DROP CONSTRAINT "DevicePersonMapping_credentialId_fkey";
ALTER TABLE "BiometricDeletionJob" DROP CONSTRAINT "BiometricDeletionJob_credentialId_fkey";
ALTER TABLE "BiometricDeletionJob" DROP CONSTRAINT "BiometricDeletionJob_eventId_fkey";

DROP INDEX "BiometricCredential_admissionId_deletedAt_idx";
DROP INDEX "BiometricCredential_attendeeId_deletedAt_idx";
DROP INDEX "BiometricCredential_eventId_deletedAt_idx";
DROP INDEX "BiometricCredential_externalCredentialId_idx";
DROP INDEX "DevicePersonMapping_attendeeId_idx";
DROP INDEX "DevicePersonMapping_deviceId_credentialId_key";

ALTER TABLE "BiometricCredential"
  DROP COLUMN "admissionId",
  DROP COLUMN "attendeeId",
  DROP COLUMN "eventId",
  DROP COLUMN "externalCredentialId",
  DROP COLUMN "retentionUntil",
  DROP COLUMN "provider",
  ALTER COLUMN "biometricIdentityId" SET NOT NULL,
  ALTER COLUMN "providerV2" SET NOT NULL;
ALTER TABLE "BiometricCredential" RENAME COLUMN "providerV2" TO "provider";

ALTER TABLE "DevicePersonMapping"
  DROP COLUMN "attendeeId",
  DROP COLUMN "credentialId",
  DROP COLUMN "deletedAt",
  ALTER COLUMN "biometricIdentityId" SET NOT NULL,
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "BiometricDeletionJob"
  DROP COLUMN "credentialId",
  ALTER COLUMN "biometricIdentityId" SET NOT NULL,
  ALTER COLUMN "eventId" DROP NOT NULL,
  ALTER COLUMN "reason" DROP DEFAULT;

CREATE UNIQUE INDEX "BiometricIdentity_activeConsentId_key" ON "BiometricIdentity"("activeConsentId");
CREATE INDEX "BiometricIdentity_consumerUserId_status_reusableAcrossEvent_idx" ON "BiometricIdentity"("consumerUserId", "status", "reusableAcrossEvents");
CREATE INDEX "BiometricIdentity_provider_providerExternalId_idx" ON "BiometricIdentity"("provider", "providerExternalId");
CREATE INDEX "BiometricIdentity_status_updatedAt_idx" ON "BiometricIdentity"("status", "updatedAt");
CREATE UNIQUE INDEX "BiometricIdentity_one_reusable_per_consumer_provider" ON "BiometricIdentity"("consumerUserId", "provider") WHERE "consumerUserId" IS NOT NULL AND "reusableAcrossEvents" = true AND "status" <> 'DELETED';

CREATE UNIQUE INDEX "EventBiometricAuthorization_admissionId_key" ON "EventBiometricAuthorization"("admissionId");
CREATE UNIQUE INDEX "EventBiometricAuthorization_eventId_biometricIdentityId_key" ON "EventBiometricAuthorization"("eventId", "biometricIdentityId");
CREATE INDEX "EventBiometricAuthorization_eventId_status_idx" ON "EventBiometricAuthorization"("eventId", "status");
CREATE INDEX "EventBiometricAuthorization_attendeeId_status_idx" ON "EventBiometricAuthorization"("attendeeId", "status");
CREATE INDEX "EventBiometricAuthorization_biometricIdentityId_status_idx" ON "EventBiometricAuthorization"("biometricIdentityId", "status");

CREATE INDEX "Attendee_consumerUserId_idx" ON "Attendee"("consumerUserId");
CREATE UNIQUE INDEX "Attendee_eventId_consumerUserId_key" ON "Attendee"("eventId", "consumerUserId");
CREATE INDEX "BiometricConsent_consumerUserId_scope_revokedAt_idx" ON "BiometricConsent"("consumerUserId", "scope", "revokedAt");
CREATE INDEX "BiometricConsent_biometricIdentityId_revokedAt_idx" ON "BiometricConsent"("biometricIdentityId", "revokedAt");
CREATE INDEX "BiometricCredential_biometricIdentityId_deletedAt_idx" ON "BiometricCredential"("biometricIdentityId", "deletedAt");
CREATE INDEX "BiometricCredential_provider_providerExternalId_idx" ON "BiometricCredential"("provider", "providerExternalId");
CREATE INDEX "BiometricDeletionJob_biometricIdentityId_status_idx" ON "BiometricDeletionJob"("biometricIdentityId", "status");
CREATE INDEX "DevicePersonMapping_biometricIdentityId_syncStatus_idx" ON "DevicePersonMapping"("biometricIdentityId", "syncStatus");
CREATE INDEX "DevicePersonMapping_eventId_syncStatus_idx" ON "DevicePersonMapping"("eventId", "syncStatus");
CREATE UNIQUE INDEX "DevicePersonMapping_deviceId_eventId_biometricIdentityId_key" ON "DevicePersonMapping"("deviceId", "eventId", "biometricIdentityId");

ALTER TABLE "Attendee" ADD CONSTRAINT "Attendee_consumerUserId_fkey" FOREIGN KEY ("consumerUserId") REFERENCES "ConsumerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BiometricConsent" ADD CONSTRAINT "BiometricConsent_consumerUserId_fkey" FOREIGN KEY ("consumerUserId") REFERENCES "ConsumerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BiometricConsent" ADD CONSTRAINT "BiometricConsent_biometricIdentityId_fkey" FOREIGN KEY ("biometricIdentityId") REFERENCES "BiometricIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BiometricIdentity" ADD CONSTRAINT "BiometricIdentity_consumerUserId_fkey" FOREIGN KEY ("consumerUserId") REFERENCES "ConsumerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BiometricIdentity" ADD CONSTRAINT "BiometricIdentity_activeConsentId_fkey" FOREIGN KEY ("activeConsentId") REFERENCES "BiometricConsent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BiometricCredential" ADD CONSTRAINT "BiometricCredential_biometricIdentityId_fkey" FOREIGN KEY ("biometricIdentityId") REFERENCES "BiometricIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventBiometricAuthorization" ADD CONSTRAINT "EventBiometricAuthorization_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventBiometricAuthorization" ADD CONSTRAINT "EventBiometricAuthorization_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "EventTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventBiometricAuthorization" ADD CONSTRAINT "EventBiometricAuthorization_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventBiometricAuthorization" ADD CONSTRAINT "EventBiometricAuthorization_biometricIdentityId_fkey" FOREIGN KEY ("biometricIdentityId") REFERENCES "BiometricIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventBiometricAuthorization" ADD CONSTRAINT "EventBiometricAuthorization_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "BiometricConsent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DevicePersonMapping" ADD CONSTRAINT "DevicePersonMapping_biometricIdentityId_fkey" FOREIGN KEY ("biometricIdentityId") REFERENCES "BiometricIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnrollmentSession" ADD CONSTRAINT "EnrollmentSession_consumerUserId_fkey" FOREIGN KEY ("consumerUserId") REFERENCES "ConsumerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BiometricDeletionJob" ADD CONSTRAINT "BiometricDeletionJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BiometricDeletionJob" ADD CONSTRAINT "BiometricDeletionJob_biometricIdentityId_fkey" FOREIGN KEY ("biometricIdentityId") REFERENCES "BiometricIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
