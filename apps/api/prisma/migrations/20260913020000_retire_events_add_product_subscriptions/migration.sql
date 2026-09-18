-- CreateEnum
CREATE TYPE "ProductSubscriptionCadence" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- DropForeignKey
ALTER TABLE "AccessAttempt" DROP CONSTRAINT "AccessAttempt_admissionId_fkey";

-- DropForeignKey
ALTER TABLE "AccessAttempt" DROP CONSTRAINT "AccessAttempt_attendeeId_fkey";

-- DropForeignKey
ALTER TABLE "AccessAttempt" DROP CONSTRAINT "AccessAttempt_deviceId_fkey";

-- DropForeignKey
ALTER TABLE "AccessAttempt" DROP CONSTRAINT "AccessAttempt_eventId_fkey";

-- DropForeignKey
ALTER TABLE "AccessDevice" DROP CONSTRAINT "AccessDevice_eventId_fkey";

-- DropForeignKey
ALTER TABLE "AccessDevice" DROP CONSTRAINT "AccessDevice_venueId_fkey";

-- DropForeignKey
ALTER TABLE "AccessEvent" DROP CONSTRAINT "AccessEvent_actorUserId_fkey";

-- DropForeignKey
ALTER TABLE "AccessEvent" DROP CONSTRAINT "AccessEvent_admissionId_fkey";

-- DropForeignKey
ALTER TABLE "AccessEvent" DROP CONSTRAINT "AccessEvent_attendeeId_fkey";

-- DropForeignKey
ALTER TABLE "AccessEvent" DROP CONSTRAINT "AccessEvent_deviceId_fkey";

-- DropForeignKey
ALTER TABLE "AccessEvent" DROP CONSTRAINT "AccessEvent_eventId_fkey";

-- DropForeignKey
ALTER TABLE "AdmissionAssignment" DROP CONSTRAINT "AdmissionAssignment_admissionId_fkey";

-- DropForeignKey
ALTER TABLE "AdmissionAssignment" DROP CONSTRAINT "AdmissionAssignment_attendeeId_fkey";

-- DropForeignKey
ALTER TABLE "Attendee" DROP CONSTRAINT "Attendee_consumerUserId_fkey";

-- DropForeignKey
ALTER TABLE "Attendee" DROP CONSTRAINT "Attendee_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Attendee" DROP CONSTRAINT "Attendee_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "BiometricConsent" DROP CONSTRAINT "BiometricConsent_admissionId_fkey";

-- DropForeignKey
ALTER TABLE "BiometricConsent" DROP CONSTRAINT "BiometricConsent_attendeeId_fkey";

-- DropForeignKey
ALTER TABLE "BiometricConsent" DROP CONSTRAINT "BiometricConsent_biometricIdentityId_fkey";

-- DropForeignKey
ALTER TABLE "BiometricConsent" DROP CONSTRAINT "BiometricConsent_consumerUserId_fkey";

-- DropForeignKey
ALTER TABLE "BiometricConsent" DROP CONSTRAINT "BiometricConsent_eventId_fkey";

-- DropForeignKey
ALTER TABLE "BiometricCredential" DROP CONSTRAINT "BiometricCredential_biometricIdentityId_fkey";

-- DropForeignKey
ALTER TABLE "BiometricDeletionJob" DROP CONSTRAINT "BiometricDeletionJob_biometricIdentityId_fkey";

-- DropForeignKey
ALTER TABLE "BiometricDeletionJob" DROP CONSTRAINT "BiometricDeletionJob_eventId_fkey";

-- DropForeignKey
ALTER TABLE "BiometricIdentity" DROP CONSTRAINT "BiometricIdentity_activeConsentId_fkey";

-- DropForeignKey
ALTER TABLE "BiometricIdentity" DROP CONSTRAINT "BiometricIdentity_consumerUserId_fkey";

-- DropForeignKey
ALTER TABLE "CashShift" DROP CONSTRAINT "CashShift_cashierId_fkey";

-- DropForeignKey
ALTER TABLE "CashShift" DROP CONSTRAINT "CashShift_eventId_fkey";

-- DropForeignKey
ALTER TABLE "DeviceEventIngest" DROP CONSTRAINT "DeviceEventIngest_accessAttemptId_fkey";

-- DropForeignKey
ALTER TABLE "DeviceEventIngest" DROP CONSTRAINT "DeviceEventIngest_accessEventId_fkey";

-- DropForeignKey
ALTER TABLE "DeviceEventIngest" DROP CONSTRAINT "DeviceEventIngest_deviceId_fkey";

-- DropForeignKey
ALTER TABLE "DevicePersonMapping" DROP CONSTRAINT "DevicePersonMapping_biometricIdentityId_fkey";

-- DropForeignKey
ALTER TABLE "DevicePersonMapping" DROP CONSTRAINT "DevicePersonMapping_deviceId_fkey";

-- DropForeignKey
ALTER TABLE "EnrollmentSession" DROP CONSTRAINT "EnrollmentSession_admissionId_fkey";

-- DropForeignKey
ALTER TABLE "EnrollmentSession" DROP CONSTRAINT "EnrollmentSession_consumerUserId_fkey";

-- DropForeignKey
ALTER TABLE "EnrollmentSession" DROP CONSTRAINT "EnrollmentSession_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_venueId_fkey";

-- DropForeignKey
ALTER TABLE "EventAuditLog" DROP CONSTRAINT "EventAuditLog_actorUserId_fkey";

-- DropForeignKey
ALTER TABLE "EventAuditLog" DROP CONSTRAINT "EventAuditLog_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventAuditLog" DROP CONSTRAINT "EventAuditLog_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "EventBiometricAuthorization" DROP CONSTRAINT "EventBiometricAuthorization_admissionId_fkey";

-- DropForeignKey
ALTER TABLE "EventBiometricAuthorization" DROP CONSTRAINT "EventBiometricAuthorization_attendeeId_fkey";

-- DropForeignKey
ALTER TABLE "EventBiometricAuthorization" DROP CONSTRAINT "EventBiometricAuthorization_biometricIdentityId_fkey";

-- DropForeignKey
ALTER TABLE "EventBiometricAuthorization" DROP CONSTRAINT "EventBiometricAuthorization_consentId_fkey";

-- DropForeignKey
ALTER TABLE "EventBiometricAuthorization" DROP CONSTRAINT "EventBiometricAuthorization_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventFinancialTransaction" DROP CONSTRAINT "EventFinancialTransaction_adjustmentForId_fkey";

-- DropForeignKey
ALTER TABLE "EventFinancialTransaction" DROP CONSTRAINT "EventFinancialTransaction_cashShiftId_fkey";

-- DropForeignKey
ALTER TABLE "EventFinancialTransaction" DROP CONSTRAINT "EventFinancialTransaction_orderId_fkey";

-- DropForeignKey
ALTER TABLE "EventOrder" DROP CONSTRAINT "EventOrder_cashShiftId_fkey";

-- DropForeignKey
ALTER TABLE "EventOrder" DROP CONSTRAINT "EventOrder_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventOrder" DROP CONSTRAINT "EventOrder_gaPriceStageId_fkey";

-- DropForeignKey
ALTER TABLE "EventOrder" DROP CONSTRAINT "EventOrder_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "EventOrder" DROP CONSTRAINT "EventOrder_paymentIntentId_fkey";

-- DropForeignKey
ALTER TABLE "EventOrder" DROP CONSTRAINT "EventOrder_reservationId_fkey";

-- DropForeignKey
ALTER TABLE "EventPriceStage" DROP CONSTRAINT "EventPriceStage_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventPromoterAllocation" DROP CONSTRAINT "EventPromoterAllocation_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventPromoterAllocation" DROP CONSTRAINT "EventPromoterAllocation_promoterId_fkey";

-- DropForeignKey
ALTER TABLE "EventPromoterAllocation" DROP CONSTRAINT "EventPromoterAllocation_ticketTypeId_fkey";

-- DropForeignKey
ALTER TABLE "EventRefund" DROP CONSTRAINT "EventRefund_actorUserId_fkey";

-- DropForeignKey
ALTER TABLE "EventRefund" DROP CONSTRAINT "EventRefund_orderId_fkey";

-- DropForeignKey
ALTER TABLE "EventSeat" DROP CONSTRAINT "EventSeat_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventStaffMembership" DROP CONSTRAINT "EventStaffMembership_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventStaffMembership" DROP CONSTRAINT "EventStaffMembership_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "EventStaffMembership" DROP CONSTRAINT "EventStaffMembership_merchantUserId_fkey";

-- DropForeignKey
ALTER TABLE "EventTicket" DROP CONSTRAINT "EventTicket_attendeeId_fkey";

-- DropForeignKey
ALTER TABLE "EventTicket" DROP CONSTRAINT "EventTicket_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventTicket" DROP CONSTRAINT "EventTicket_eventOrderId_fkey";

-- DropForeignKey
ALTER TABLE "EventTicket" DROP CONSTRAINT "EventTicket_eventPriceStageId_fkey";

-- DropForeignKey
ALTER TABLE "EventTicket" DROP CONSTRAINT "EventTicket_eventSeatId_fkey";

-- DropForeignKey
ALTER TABLE "GuestListEntry" DROP CONSTRAINT "GuestListEntry_admissionId_fkey";

-- DropForeignKey
ALTER TABLE "GuestListEntry" DROP CONSTRAINT "GuestListEntry_allocationId_fkey";

-- DropForeignKey
ALTER TABLE "GuestListEntry" DROP CONSTRAINT "GuestListEntry_eventId_fkey";

-- DropForeignKey
ALTER TABLE "GuestListEntry" DROP CONSTRAINT "GuestListEntry_promoterId_fkey";

-- DropForeignKey
ALTER TABLE "GuestListEntry" DROP CONSTRAINT "GuestListEntry_ticketTypeId_fkey";

-- DropForeignKey
ALTER TABLE "PromoterProfile" DROP CONSTRAINT "PromoterProfile_merchantUserId_fkey";

-- DropForeignKey
ALTER TABLE "SupportCase" DROP CONSTRAINT "SupportCase_createdByOpsUserId_fkey";

-- DropForeignKey
ALTER TABLE "TicketReservation" DROP CONSTRAINT "TicketReservation_eventId_fkey";

-- DropForeignKey
ALTER TABLE "TicketReservation" DROP CONSTRAINT "TicketReservation_paymentIntentId_fkey";

-- DropForeignKey
ALTER TABLE "TicketReservationItem" DROP CONSTRAINT "TicketReservationItem_reservationId_fkey";

-- DropForeignKey
ALTER TABLE "TicketReservationItem" DROP CONSTRAINT "TicketReservationItem_ticketTypeId_fkey";

-- DropForeignKey
ALTER TABLE "Venue" DROP CONSTRAINT "Venue_merchantId_fkey";

-- AlterTable
ALTER TABLE "StoreProductStat" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "AccessAttempt";

-- DropTable
DROP TABLE "AccessDevice";

-- DropTable
DROP TABLE "AccessEvent";

-- DropTable
DROP TABLE "AdmissionAssignment";

-- DropTable
DROP TABLE "Attendee";

-- DropTable
DROP TABLE "BiometricConsent";

-- DropTable
DROP TABLE "BiometricCredential";

-- DropTable
DROP TABLE "BiometricDeletionJob";

-- DropTable
DROP TABLE "BiometricIdentity";

-- DropTable
DROP TABLE "CashShift";

-- DropTable
DROP TABLE "DeviceEventIngest";

-- DropTable
DROP TABLE "DevicePersonMapping";

-- DropTable
DROP TABLE "EnrollmentSession";

-- DropTable
DROP TABLE "Event";

-- DropTable
DROP TABLE "EventAuditLog";

-- DropTable
DROP TABLE "EventBiometricAuthorization";

-- DropTable
DROP TABLE "EventFinancialTransaction";

-- DropTable
DROP TABLE "EventOrder";

-- DropTable
DROP TABLE "EventPriceStage";

-- DropTable
DROP TABLE "EventPromoterAllocation";

-- DropTable
DROP TABLE "EventRefund";

-- DropTable
DROP TABLE "EventSeat";

-- DropTable
DROP TABLE "EventStaffMembership";

-- DropTable
DROP TABLE "EventTicket";

-- DropTable
DROP TABLE "GuestListEntry";

-- DropTable
DROP TABLE "PromoterProfile";

-- DropTable
DROP TABLE "TicketReservation";

-- DropTable
DROP TABLE "TicketReservationItem";

-- DropTable
DROP TABLE "Venue";

-- DropEnum
DROP TYPE "AccessDecision";

-- DropEnum
DROP TYPE "AccessDeviceRole";

-- DropEnum
DROP TYPE "AccessDeviceStatus";

-- DropEnum
DROP TYPE "AccessDirection";

-- DropEnum
DROP TYPE "AdmissionSource";

-- DropEnum
DROP TYPE "AssignmentStatus";

-- DropEnum
DROP TYPE "BiometricConsentScope";

-- DropEnum
DROP TYPE "BiometricDeletionStatus";

-- DropEnum
DROP TYPE "BiometricEnrollmentStatus";

-- DropEnum
DROP TYPE "BiometricIdentityStatus";

-- DropEnum
DROP TYPE "BiometricProvider";

-- DropEnum
DROP TYPE "BiometricReenrollmentReason";

-- DropEnum
DROP TYPE "DevicePersonSyncStatus";

-- DropEnum
DROP TYPE "EventBiometricAuthorizationStatus";

-- DropEnum
DROP TYPE "EventOrderStatus";

-- DropEnum
DROP TYPE "EventPaymentMethod";

-- DropEnum
DROP TYPE "EventPricingMode";

-- DropEnum
DROP TYPE "EventSeatStatus";

-- DropEnum
DROP TYPE "EventStaffRole";

-- DropEnum
DROP TYPE "EventStatus";

-- DropEnum
DROP TYPE "EventTicketStatus";

-- DropEnum
DROP TYPE "GuestListStatus";

-- DropEnum
DROP TYPE "PresenceStatus";

-- DropEnum
DROP TYPE "PromoterAllocationKind";

-- DropEnum
DROP TYPE "TicketReservationStatus";

-- DropEnum
DROP TYPE "TicketTypeKind";

-- CreateTable
CREATE TABLE "ProductSubscriptionOption" (
    "id" TEXT NOT NULL,
    "paymentLinkId" TEXT NOT NULL,
    "cadence" "ProductSubscriptionCadence" NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSubscriptionOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductSubscriptionOption_paymentLinkId_cadence_key" ON "ProductSubscriptionOption"("paymentLinkId", "cadence");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_hashedToken_idx" ON "EmailVerificationToken"("hashedToken");

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_createdByOpsUserId_fkey" FOREIGN KEY ("createdByOpsUserId") REFERENCES "OpsUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSubscriptionOption" ADD CONSTRAINT "ProductSubscriptionOption_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "IntegrationSubscriptionMapping_connectionId_externalSubscriptio" RENAME TO "IntegrationSubscriptionMapping_connectionId_externalSubscri_key";

-- RenameIndex
ALTER INDEX "IntegrationSubscriptionPlanMapping_connectionId_externalPlanCod" RENAME TO "IntegrationSubscriptionPlanMapping_connectionId_externalPla_key";

-- RenameIndex
ALTER INDEX "IntegrationSubscriptionPlanMapping_connectionId_subscriptionPla" RENAME TO "IntegrationSubscriptionPlanMapping_connectionId_subscriptio_key";

