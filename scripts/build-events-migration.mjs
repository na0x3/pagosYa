import fs from "node:fs";

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) throw new Error("usage: build-events-migration.mjs <prisma-diff.sql> <migration.sql>");

const existingTables = new Set(["Event", "EventOrder", "EventPriceStage", "EventSeat", "EventTicket"]);
const moduleTables = new Set([
  "Venue", "TicketReservation", "TicketReservationItem", "AdmissionAssignment", "Attendee",
  "BiometricConsent", "BiometricCredential", "AccessDevice", "DevicePersonMapping", "DeviceEventIngest",
  "AccessEvent", "AccessAttempt", "EnrollmentSession", "BiometricDeletionJob", "CashShift",
  "EventFinancialTransaction", "EventRefund", "EventStaffMembership", "PromoterProfile",
  "EventPromoterAllocation", "GuestListEntry", "EventAuditLog",
]);
const allowedTables = new Set([...existingTables, ...moduleTables]);
const newEnums = new Set([
  "TicketTypeKind", "TicketReservationStatus", "AdmissionSource", "EventPaymentMethod", "AssignmentStatus",
  "BiometricEnrollmentStatus", "PresenceStatus", "EventStaffRole", "AccessDeviceRole", "AccessDeviceStatus",
  "AccessDirection", "AccessDecision", "BiometricDeletionStatus", "PromoterAllocationKind", "GuestListStatus",
]);

const source = fs.readFileSync(sourcePath, "utf8").replace(/^--.*$/gm, "");
const statements = source.split(";").map((part) => part.trim()).filter(Boolean).map((part) => `${part};`);
const selected = statements.filter((statement) => {
  const createType = statement.match(/^CREATE TYPE "([^"]+)"/);
  if (createType) return newEnums.has(createType[1]);
  if (/^ALTER TYPE "(?:EventOrderStatus|EventStatus|EventTicketStatus)" ADD VALUE/.test(statement)) return true;
  const createTable = statement.match(/^CREATE TABLE "([^"]+)"/);
  if (createTable) return moduleTables.has(createTable[1]);
  const createIndex = statement.match(/^CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([^"]+)"/);
  if (createIndex) {
    if (!allowedTables.has(createIndex[1])) return false;
    if (createIndex[1] === "EventSeat") return false;
    return !/"Event_(?:slug_key|status_startsAt_idx)"|"EventOrder_paymentIntentId_key"|"EventPriceStage_eventId_order|"EventTicket_(?:eventSeatId_key|qrToken_key)/.test(statement);
  }
  const alter = statement.match(/^ALTER TABLE "([^"]+)"/);
  if (!alter || !allowedTables.has(alter[1]) || /^ALTER TABLE .* DROP /.test(statement)) return false;
  if (["Event", "EventOrder", "EventPriceStage", "EventSeat", "EventTicket"].includes(alter[1])) return false;
  return true;
});

const compatibilityAlterations = `
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
`;

const enumStatements = selected.filter((statement) => /^(?:CREATE|ALTER) TYPE/.test(statement));
const createTables = selected.filter((statement) => /^CREATE TABLE/.test(statement));
const indexes = selected.filter((statement) => /^CREATE (?:UNIQUE )?INDEX/.test(statement));
const foreignKeys = selected.filter((statement) => /^ALTER TABLE/.test(statement));

const output = [
  "-- PagosYa Events + facial access. Additive migration over the existing ticketing tables.",
  ...enumStatements,
  compatibilityAlterations.trim(),
  ...createTables,
  ...indexes,
  ...foreignKeys,
  "",
].join("\n\n");
fs.writeFileSync(outputPath, output);
