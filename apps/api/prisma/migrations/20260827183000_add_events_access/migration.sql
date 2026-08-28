-- PagosYa Events + facial access. Additive migration over the existing ticketing tables.

CREATE TYPE "TicketTypeKind" AS ENUM ('GENERAL', 'VIP', 'EARLY_BIRD', 'TABLE', 'GUEST', 'STAFF', 'CUSTOM');

CREATE TYPE "TicketReservationStatus" AS ENUM ('RESERVED', 'COMPLETED', 'EXPIRED', 'CANCELLED');

CREATE TYPE "AdmissionSource" AS ENUM ('ONLINE', 'CASH_DOOR', 'PROMOTER', 'COMPLIMENTARY', 'ADMIN', 'PARTNER');

CREATE TYPE "EventPaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'QR_PAYMENT', 'ONLINE_GATEWAY', 'COMPLIMENTARY');

CREATE TYPE "AssignmentStatus" AS ENUM ('UNASSIGNED', 'CLAIMED');

CREATE TYPE "BiometricEnrollmentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'ENROLLED', 'FAILED', 'DELETED');

CREATE TYPE "PresenceStatus" AS ENUM ('NEVER_ENTERED', 'OUTSIDE', 'INSIDE');

CREATE TYPE "EventStaffRole" AS ENUM ('ORGANIZATION_ADMIN', 'EVENT_MANAGER', 'CASHIER', 'DOOR_STAFF', 'PROMOTER', 'AUDITOR');

CREATE TYPE "AccessDeviceRole" AS ENUM ('ENTRY', 'EXIT', 'BIDIRECTIONAL', 'ENROLLMENT');

CREATE TYPE "AccessDeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'DEGRADED', 'DISABLED');

CREATE TYPE "AccessDirection" AS ENUM ('ENTRY', 'EXIT', 'MANUAL_ENTRY', 'MANUAL_EXIT');

CREATE TYPE "AccessDecision" AS ENUM ('ALLOW', 'DENY', 'IGNORED');

CREATE TYPE "BiometricDeletionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TYPE "PromoterAllocationKind" AS ENUM ('COMPLIMENTARY', 'DISCOUNTED');

CREATE TYPE "GuestListStatus" AS ENUM ('INVITED', 'CLAIMED', 'ENROLLED', 'ENTERED', 'CANCELLED');

-- Extend the existing PagosYa Events tables in place. Existing seated/GA sales
-- remain intact and are not silently enabled for biometric access.
ALTER TABLE "Event"
  ADD COLUMN "allowReentry" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "biometricRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "capacity" INTEGER,
  ADD COLUMN "doorsOpenAt" TIMESTAMP(3),
  ADD COLUMN "endsAt" TIMESTAMP(3),
  ADD COLUMN "entryGracePeriodMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastEntryAt" TIMESTAMP(3),
  ADD COLUMN "manualOverrideAllowed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "onlineSalesEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reservationMinutes" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "retentionHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "salesAtDoorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/La_Paz',
  ADD COLUMN "venueId" TEXT,
  ALTER COLUMN "publicityImageUrl" SET DEFAULT '',
  ALTER COLUMN "venueName" SET DEFAULT '',
  ALTER COLUMN "pricingMode" SET DEFAULT 'GENERAL_ADMISSION';
ALTER TABLE "Event" ALTER COLUMN "onlineSalesEnabled" SET DEFAULT true;
ALTER TABLE "Event" ALTER COLUMN "salesAtDoorEnabled" SET DEFAULT true;

ALTER TABLE "EventPriceStage"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "capacityContribution" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'BOB',
  ADD COLUMN "kind" "TicketTypeKind" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "reentryAllowed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "salesEnd" TIMESTAMP(3),
  ADD COLUMN "salesStart" TIMESTAMP(3),
  ALTER COLUMN "order" SET DEFAULT 0;

ALTER TABLE "EventOrder"
  ADD COLUMN "cashShiftId" TEXT,
  ADD COLUMN "managementTokenHash" TEXT,
  ADD COLUMN "merchantId" TEXT,
  ADD COLUMN "paymentMethod" "EventPaymentMethod",
  ADD COLUMN "reservationId" TEXT,
  ADD COLUMN "source" "AdmissionSource",
  ALTER COLUMN "paymentIntentId" DROP NOT NULL,
  ALTER COLUMN "buyerName" DROP NOT NULL,
  ALTER COLUMN "buyerEmail" DROP NOT NULL;
UPDATE "EventOrder" o SET "merchantId" = e."merchantId", "paymentMethod" = 'ONLINE_GATEWAY', "source" = 'ONLINE'
FROM "Event" e WHERE e.id = o."eventId";
ALTER TABLE "EventOrder" ALTER COLUMN "merchantId" SET NOT NULL;
ALTER TABLE "EventOrder" ALTER COLUMN "paymentMethod" SET NOT NULL;
ALTER TABLE "EventOrder" ALTER COLUMN "source" SET NOT NULL;

ALTER TABLE "EventTicket"
  ADD COLUMN "assignmentStatus" "AssignmentStatus" NOT NULL DEFAULT 'UNASSIGNED',
  ADD COLUMN "attendeeId" TEXT,
  ADD COLUMN "biometricEnrollmentStatus" "BiometricEnrollmentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "eventId" TEXT,
  ADD COLUMN "firstEnteredAt" TIMESTAMP(3),
  ADD COLUMN "lastPresenceChangedAt" TIMESTAMP(3),
  ADD COLUMN "presenceStatus" "PresenceStatus" NOT NULL DEFAULT 'NEVER_ENTERED',
  ADD COLUMN "source" "AdmissionSource",
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "EventTicket" t SET "eventId" = o."eventId", "source" = 'ONLINE'
FROM "EventOrder" o WHERE o.id = t."eventOrderId";
ALTER TABLE "EventTicket" ALTER COLUMN "eventId" SET NOT NULL;
ALTER TABLE "EventTicket" ALTER COLUMN "source" SET NOT NULL;
ALTER TABLE "EventTicket" ALTER COLUMN "biometricEnrollmentStatus" SET DEFAULT 'PENDING';
ALTER TABLE "EventTicket" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT NOT NULL DEFAULT 'La Paz',
    "timezone" TEXT NOT NULL DEFAULT 'America/La_Paz',
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketReservation" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "TicketReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BOB',
    "buyerName" TEXT,
    "buyerEmail" TEXT,
    "buyerPhone" TEXT,
    "managementTokenHash" TEXT NOT NULL,
    "managementTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "paymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketReservationItem" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketReservationItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdmissionAssignment" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "claimTokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmissionAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attendee" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BiometricConsent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BiometricConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BiometricCredential" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalCredentialId" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiometricCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessDevice" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "eventId" TEXT,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT 'ZKTeco',
    "model" TEXT NOT NULL DEFAULT 'SpeedFace-V5',
    "serialNumber" TEXT,
    "ipAddress" TEXT,
    "port" INTEGER,
    "role" "AccessDeviceRole" NOT NULL,
    "status" "AccessDeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" TIMESTAMP(3),
    "firmwareVersion" TEXT,
    "configuration" JSONB,
    "encryptedSecrets" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DevicePersonMapping" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "externalPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DevicePersonMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceEventIngest" (
    "id" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalPersonId" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "livenessPassed" BOOLEAN,
    "rawVendorEventReference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "accessEventId" TEXT,
    "accessAttemptId" TEXT,

    CONSTRAINT "DeviceEventIngest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "deviceId" TEXT,
    "admissionId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "direction" "AccessDirection" NOT NULL,
    "decision" "AccessDecision" NOT NULL DEFAULT 'ALLOW',
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessAttempt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "deviceId" TEXT,
    "admissionId" TEXT,
    "attendeeId" TEXT,
    "direction" "AccessDirection",
    "decision" "AccessDecision" NOT NULL,
    "reason" TEXT NOT NULL,
    "externalPersonId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnrollmentSession" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "deviceId" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BiometricDeletionJob" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "status" "BiometricDeletionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BiometricDeletionJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashShift" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingFloat" INTEGER NOT NULL,
    "expectedCash" INTEGER,
    "declaredCash" INTEGER,
    "difference" INTEGER,

    CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventFinancialTransaction" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "cashShiftId" TEXT,
    "type" TEXT NOT NULL,
    "paymentMethod" "EventPaymentMethod" NOT NULL,
    "status" "EventOrderStatus" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BOB',
    "reason" TEXT,
    "actorUserId" TEXT,
    "adjustmentForId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventFinancialTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BOB',
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRefund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventStaffMembership" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "merchantUserId" TEXT NOT NULL,
    "role" "EventStaffRole" NOT NULL,
    "permissions" JSONB,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventStaffMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromoterProfile" (
    "id" TEXT NOT NULL,
    "merchantUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoterProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventPromoterAllocation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "promoterId" TEXT NOT NULL,
    "ticketTypeId" TEXT,
    "kind" "PromoterAllocationKind" NOT NULL,
    "quota" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventPromoterAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestListEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "promoterId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "ticketTypeId" TEXT,
    "admissionId" TEXT,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "status" "GuestListStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestListEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "merchantId" TEXT NOT NULL,
    "eventId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Venue_merchantId_createdAt_idx" ON "Venue"("merchantId", "createdAt");

CREATE UNIQUE INDEX "TicketReservation_managementTokenHash_key" ON "TicketReservation"("managementTokenHash");

CREATE UNIQUE INDEX "TicketReservation_paymentIntentId_key" ON "TicketReservation"("paymentIntentId");

CREATE INDEX "TicketReservation_eventId_status_expiresAt_idx" ON "TicketReservation"("eventId", "status", "expiresAt");

CREATE INDEX "TicketReservation_merchantId_createdAt_idx" ON "TicketReservation"("merchantId", "createdAt");

CREATE INDEX "TicketReservationItem_ticketTypeId_idx" ON "TicketReservationItem"("ticketTypeId");

CREATE UNIQUE INDEX "TicketReservationItem_reservationId_ticketTypeId_key" ON "TicketReservationItem"("reservationId", "ticketTypeId");

CREATE UNIQUE INDEX "AdmissionAssignment_claimTokenHash_key" ON "AdmissionAssignment"("claimTokenHash");

CREATE INDEX "AdmissionAssignment_admissionId_createdAt_idx" ON "AdmissionAssignment"("admissionId", "createdAt");

CREATE INDEX "AdmissionAssignment_attendeeId_createdAt_idx" ON "AdmissionAssignment"("attendeeId", "createdAt");

CREATE INDEX "Attendee_merchantId_createdAt_idx" ON "Attendee"("merchantId", "createdAt");

CREATE INDEX "Attendee_eventId_displayName_idx" ON "Attendee"("eventId", "displayName");

CREATE INDEX "Attendee_eventId_email_idx" ON "Attendee"("eventId", "email");

CREATE INDEX "Attendee_eventId_phone_idx" ON "Attendee"("eventId", "phone");

CREATE INDEX "BiometricConsent_eventId_consentedAt_idx" ON "BiometricConsent"("eventId", "consentedAt");

CREATE INDEX "BiometricConsent_attendeeId_consentedAt_idx" ON "BiometricConsent"("attendeeId", "consentedAt");

CREATE INDEX "BiometricConsent_admissionId_idx" ON "BiometricConsent"("admissionId");

CREATE INDEX "BiometricCredential_eventId_deletedAt_idx" ON "BiometricCredential"("eventId", "deletedAt");

CREATE INDEX "BiometricCredential_attendeeId_deletedAt_idx" ON "BiometricCredential"("attendeeId", "deletedAt");

CREATE INDEX "BiometricCredential_admissionId_deletedAt_idx" ON "BiometricCredential"("admissionId", "deletedAt");

CREATE INDEX "BiometricCredential_externalCredentialId_idx" ON "BiometricCredential"("externalCredentialId");

CREATE INDEX "AccessDevice_eventId_role_status_idx" ON "AccessDevice"("eventId", "role", "status");

CREATE INDEX "AccessDevice_venueId_status_idx" ON "AccessDevice"("venueId", "status");

CREATE UNIQUE INDEX "AccessDevice_merchantId_serialNumber_key" ON "AccessDevice"("merchantId", "serialNumber");

CREATE INDEX "DevicePersonMapping_attendeeId_idx" ON "DevicePersonMapping"("attendeeId");

CREATE INDEX "DevicePersonMapping_externalPersonId_idx" ON "DevicePersonMapping"("externalPersonId");

CREATE UNIQUE INDEX "DevicePersonMapping_deviceId_eventId_externalPersonId_key" ON "DevicePersonMapping"("deviceId", "eventId", "externalPersonId");

CREATE UNIQUE INDEX "DevicePersonMapping_deviceId_credentialId_key" ON "DevicePersonMapping"("deviceId", "credentialId");

CREATE UNIQUE INDEX "DeviceEventIngest_externalEventId_key" ON "DeviceEventIngest"("externalEventId");

CREATE UNIQUE INDEX "DeviceEventIngest_accessEventId_key" ON "DeviceEventIngest"("accessEventId");

CREATE UNIQUE INDEX "DeviceEventIngest_accessAttemptId_key" ON "DeviceEventIngest"("accessAttemptId");

CREATE INDEX "DeviceEventIngest_deviceId_occurredAt_idx" ON "DeviceEventIngest"("deviceId", "occurredAt");

CREATE INDEX "DeviceEventIngest_occurredAt_idx" ON "DeviceEventIngest"("occurredAt");

CREATE INDEX "AccessEvent_eventId_occurredAt_idx" ON "AccessEvent"("eventId", "occurredAt");

CREATE INDEX "AccessEvent_admissionId_occurredAt_idx" ON "AccessEvent"("admissionId", "occurredAt");

CREATE INDEX "AccessEvent_attendeeId_occurredAt_idx" ON "AccessEvent"("attendeeId", "occurredAt");

CREATE INDEX "AccessEvent_deviceId_occurredAt_idx" ON "AccessEvent"("deviceId", "occurredAt");

CREATE INDEX "AccessAttempt_eventId_occurredAt_idx" ON "AccessAttempt"("eventId", "occurredAt");

CREATE INDEX "AccessAttempt_admissionId_occurredAt_idx" ON "AccessAttempt"("admissionId", "occurredAt");

CREATE INDEX "AccessAttempt_deviceId_occurredAt_idx" ON "AccessAttempt"("deviceId", "occurredAt");

CREATE UNIQUE INDEX "EnrollmentSession_codeHash_key" ON "EnrollmentSession"("codeHash");

CREATE INDEX "EnrollmentSession_eventId_expiresAt_idx" ON "EnrollmentSession"("eventId", "expiresAt");

CREATE INDEX "EnrollmentSession_admissionId_expiresAt_idx" ON "EnrollmentSession"("admissionId", "expiresAt");

CREATE INDEX "BiometricDeletionJob_status_requestedAt_idx" ON "BiometricDeletionJob"("status", "requestedAt");

CREATE INDEX "BiometricDeletionJob_eventId_status_idx" ON "BiometricDeletionJob"("eventId", "status");

CREATE INDEX "CashShift_eventId_openedAt_idx" ON "CashShift"("eventId", "openedAt");

CREATE INDEX "CashShift_cashierId_openedAt_idx" ON "CashShift"("cashierId", "openedAt");

CREATE INDEX "EventFinancialTransaction_eventId_createdAt_idx" ON "EventFinancialTransaction"("eventId", "createdAt");

CREATE INDEX "EventFinancialTransaction_cashShiftId_createdAt_idx" ON "EventFinancialTransaction"("cashShiftId", "createdAt");

CREATE INDEX "EventFinancialTransaction_orderId_createdAt_idx" ON "EventFinancialTransaction"("orderId", "createdAt");

CREATE INDEX "EventRefund_orderId_createdAt_idx" ON "EventRefund"("orderId", "createdAt");

CREATE INDEX "EventStaffMembership_merchantId_eventId_idx" ON "EventStaffMembership"("merchantId", "eventId");

CREATE INDEX "EventStaffMembership_merchantUserId_revokedAt_idx" ON "EventStaffMembership"("merchantUserId", "revokedAt");

CREATE UNIQUE INDEX "EventStaffMembership_eventId_merchantUserId_role_key" ON "EventStaffMembership"("eventId", "merchantUserId", "role");

CREATE UNIQUE INDEX "PromoterProfile_merchantUserId_key" ON "PromoterProfile"("merchantUserId");

CREATE INDEX "EventPromoterAllocation_promoterId_eventId_idx" ON "EventPromoterAllocation"("promoterId", "eventId");

CREATE UNIQUE INDEX "EventPromoterAllocation_eventId_promoterId_kind_ticketTypeI_key" ON "EventPromoterAllocation"("eventId", "promoterId", "kind", "ticketTypeId");

CREATE UNIQUE INDEX "GuestListEntry_admissionId_key" ON "GuestListEntry"("admissionId");

CREATE INDEX "GuestListEntry_eventId_status_idx" ON "GuestListEntry"("eventId", "status");

CREATE INDEX "GuestListEntry_promoterId_createdAt_idx" ON "GuestListEntry"("promoterId", "createdAt");

CREATE INDEX "EventAuditLog_merchantId_createdAt_idx" ON "EventAuditLog"("merchantId", "createdAt");

CREATE INDEX "EventAuditLog_eventId_createdAt_idx" ON "EventAuditLog"("eventId", "createdAt");

CREATE INDEX "EventAuditLog_entityType_entityId_idx" ON "EventAuditLog"("entityType", "entityId");

CREATE INDEX "Event_merchantId_startsAt_idx" ON "Event"("merchantId", "startsAt");

CREATE INDEX "Event_venueId_startsAt_idx" ON "Event"("venueId", "startsAt");

CREATE UNIQUE INDEX "EventOrder_reservationId_key" ON "EventOrder"("reservationId");

CREATE UNIQUE INDEX "EventOrder_managementTokenHash_key" ON "EventOrder"("managementTokenHash");

CREATE INDEX "EventOrder_merchantId_createdAt_idx" ON "EventOrder"("merchantId", "createdAt");

CREATE INDEX "EventOrder_eventId_source_createdAt_idx" ON "EventOrder"("eventId", "source", "createdAt");

CREATE INDEX "EventOrder_status_createdAt_idx" ON "EventOrder"("status", "createdAt");

CREATE INDEX "EventPriceStage_eventId_active_idx" ON "EventPriceStage"("eventId", "active");

CREATE UNIQUE INDEX "EventPriceStage_eventId_name_key" ON "EventPriceStage"("eventId", "name");

CREATE INDEX "EventTicket_eventId_presenceStatus_idx" ON "EventTicket"("eventId", "presenceStatus");

CREATE INDEX "EventTicket_eventId_status_idx" ON "EventTicket"("eventId", "status");

CREATE INDEX "EventTicket_attendeeId_idx" ON "EventTicket"("attendeeId");

ALTER TABLE "Venue" ADD CONSTRAINT "Venue_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TicketReservation" ADD CONSTRAINT "TicketReservation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketReservation" ADD CONSTRAINT "TicketReservation_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TicketReservationItem" ADD CONSTRAINT "TicketReservationItem_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "TicketReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketReservationItem" ADD CONSTRAINT "TicketReservationItem_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "EventPriceStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdmissionAssignment" ADD CONSTRAINT "AdmissionAssignment_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "EventTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdmissionAssignment" ADD CONSTRAINT "AdmissionAssignment_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attendee" ADD CONSTRAINT "Attendee_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attendee" ADD CONSTRAINT "Attendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BiometricConsent" ADD CONSTRAINT "BiometricConsent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BiometricConsent" ADD CONSTRAINT "BiometricConsent_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BiometricConsent" ADD CONSTRAINT "BiometricConsent_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "EventTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BiometricCredential" ADD CONSTRAINT "BiometricCredential_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BiometricCredential" ADD CONSTRAINT "BiometricCredential_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BiometricCredential" ADD CONSTRAINT "BiometricCredential_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "EventTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccessDevice" ADD CONSTRAINT "AccessDevice_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccessDevice" ADD CONSTRAINT "AccessDevice_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DevicePersonMapping" ADD CONSTRAINT "DevicePersonMapping_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DevicePersonMapping" ADD CONSTRAINT "DevicePersonMapping_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DevicePersonMapping" ADD CONSTRAINT "DevicePersonMapping_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "BiometricCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeviceEventIngest" ADD CONSTRAINT "DeviceEventIngest_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeviceEventIngest" ADD CONSTRAINT "DeviceEventIngest_accessEventId_fkey" FOREIGN KEY ("accessEventId") REFERENCES "AccessEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeviceEventIngest" ADD CONSTRAINT "DeviceEventIngest_accessAttemptId_fkey" FOREIGN KEY ("accessAttemptId") REFERENCES "AccessAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "EventTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "MerchantUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccessAttempt" ADD CONSTRAINT "AccessAttempt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccessAttempt" ADD CONSTRAINT "AccessAttempt_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccessAttempt" ADD CONSTRAINT "AccessAttempt_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "EventTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccessAttempt" ADD CONSTRAINT "AccessAttempt_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EnrollmentSession" ADD CONSTRAINT "EnrollmentSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnrollmentSession" ADD CONSTRAINT "EnrollmentSession_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "EventTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BiometricDeletionJob" ADD CONSTRAINT "BiometricDeletionJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BiometricDeletionJob" ADD CONSTRAINT "BiometricDeletionJob_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "BiometricCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "MerchantUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventFinancialTransaction" ADD CONSTRAINT "EventFinancialTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "EventOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventFinancialTransaction" ADD CONSTRAINT "EventFinancialTransaction_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventFinancialTransaction" ADD CONSTRAINT "EventFinancialTransaction_adjustmentForId_fkey" FOREIGN KEY ("adjustmentForId") REFERENCES "EventFinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventRefund" ADD CONSTRAINT "EventRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "EventOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventRefund" ADD CONSTRAINT "EventRefund_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "MerchantUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventStaffMembership" ADD CONSTRAINT "EventStaffMembership_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventStaffMembership" ADD CONSTRAINT "EventStaffMembership_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventStaffMembership" ADD CONSTRAINT "EventStaffMembership_merchantUserId_fkey" FOREIGN KEY ("merchantUserId") REFERENCES "MerchantUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PromoterProfile" ADD CONSTRAINT "PromoterProfile_merchantUserId_fkey" FOREIGN KEY ("merchantUserId") REFERENCES "MerchantUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventPromoterAllocation" ADD CONSTRAINT "EventPromoterAllocation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventPromoterAllocation" ADD CONSTRAINT "EventPromoterAllocation_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "PromoterProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventPromoterAllocation" ADD CONSTRAINT "EventPromoterAllocation_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "EventPriceStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestListEntry" ADD CONSTRAINT "GuestListEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestListEntry" ADD CONSTRAINT "GuestListEntry_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "PromoterProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestListEntry" ADD CONSTRAINT "GuestListEntry_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "EventPromoterAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestListEntry" ADD CONSTRAINT "GuestListEntry_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "EventPriceStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestListEntry" ADD CONSTRAINT "GuestListEntry_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "EventTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventAuditLog" ADD CONSTRAINT "EventAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "MerchantUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventAuditLog" ADD CONSTRAINT "EventAuditLog_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventAuditLog" ADD CONSTRAINT "EventAuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- New relationships on the existing PagosYa ticketing tables.
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventOrder" ADD CONSTRAINT "EventOrder_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventOrder" ADD CONSTRAINT "EventOrder_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "TicketReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventOrder" ADD CONSTRAINT "EventOrder_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
