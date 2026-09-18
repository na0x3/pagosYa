import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  BiometricConsentScope,
  BiometricEnrollmentStatus,
  BiometricIdentityStatus,
  BiometricProvider,
  DevicePersonSyncStatus,
  EventBiometricAuthorizationStatus,
  Prisma,
} from "@prisma/client";
import type { AccessControlProvider, EnrollmentResult } from "@pagosya/access-control";
import { PrismaService } from "../prisma/prisma.service";
import { ACCESS_CONTROL_PROVIDER } from "./access-control.provider";
import { digestEventToken, enrollmentCode, secureToken } from "./event-security";
import { EventRosterService } from "./event-roster.service";
import type { CompleteEnrollmentDto } from "./events.dto";

@Injectable()
export class FaceEntryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACCESS_CONTROL_PROVIDER) private readonly provider: AccessControlProvider,
    private readonly rosters: EventRosterService,
  ) {}

  private async attachConsumerToAdmission(consumerUserId: string, admissionId: string, managementToken?: string) {
    const [consumer, admission] = await Promise.all([
      this.prisma.consumerUser.findFirst({ where: { id: consumerUserId, deletedAt: null, emailVerifiedAt: { not: null } } }),
      this.prisma.admission.findUnique({
        where: { id: admissionId },
        include: { attendee: true, order: { include: { reservation: true } } },
      }),
    ]);
    if (!consumer) throw new NotFoundException("PagosYa customer not found");
    if (!admission) throw new NotFoundException("Admission not found");
    if (admission.attendee?.consumerUserId && admission.attendee.consumerUserId !== consumerUserId) {
      throw new BadRequestException("Admission is already claimed by another PagosYa customer");
    }
    const alreadyOwned = admission.attendee?.consumerUserId === consumerUserId;
    const validManagementToken = Boolean(
      managementToken
      && admission.order.managementTokenHash === digestEventToken(managementToken)
      && admission.order.reservation
      && admission.order.reservation.managementTokenExpiresAt > new Date(),
    );
    if (!alreadyOwned && !validManagementToken) throw new BadRequestException("Admission ownership proof is invalid or expired");

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendee.findUnique({ where: { eventId_consumerUserId: { eventId: admission.eventId, consumerUserId } } });
      const attendee = existing ?? (admission.attendeeId
        ? await tx.attendee.update({
          where: { id: admission.attendeeId },
          data: { consumerUserId, displayName: consumer.name, email: consumer.email },
        })
        : await tx.attendee.create({
          data: { merchantId: admission.order.merchantId, eventId: admission.eventId, consumerUserId, displayName: consumer.name, email: consumer.email },
        }));
      await tx.admission.update({
        where: { id: admissionId },
        data: { attendeeId: attendee.id, assignmentStatus: "CLAIMED", claimedAt: admission.claimedAt ?? new Date() },
      });
      return { admission, attendee, consumer };
    });
  }

  async activateForAdmission(consumerUserId: string, admissionId: string, managementToken?: string) {
    const { admission, attendee } = await this.attachConsumerToAdmission(consumerUserId, admissionId, managementToken);
    const now = new Date();
    const identity = await this.prisma.biometricIdentity.findFirst({
      where: {
        consumerUserId,
        reusableAcrossEvents: true,
        status: BiometricIdentityStatus.ACTIVE,
        activeConsent: { is: { scope: BiometricConsentScope.REUSABLE, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!identity?.activeConsentId) {
      await this.prisma.admission.update({ where: { id: admissionId }, data: { biometricEnrollmentStatus: BiometricEnrollmentStatus.PENDING } });
      return { admissionId, faceEntryReady: false, requiresEnrollment: true, message: "Registra tu rostro una vez para activar PagosYa Face Entry" };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.eventBiometricAuthorization.upsert({
          where: { admissionId },
          create: { eventId: admission.eventId, admissionId, attendeeId: attendee.id, biometricIdentityId: identity.id, consentId: identity.activeConsentId! },
          update: { attendeeId: attendee.id, biometricIdentityId: identity.id, consentId: identity.activeConsentId!, status: EventBiometricAuthorizationStatus.AUTHORIZED, revokedAt: null, authorizedAt: now },
        });
        await tx.admission.update({ where: { id: admissionId }, data: { attendeeId: attendee.id, biometricEnrollmentStatus: BiometricEnrollmentStatus.ENROLLED } });
        await tx.eventAuditLog.create({ data: { merchantId: admission.order.merchantId, eventId: admission.eventId, action: "REUSABLE_FACE_ENTRY_LINKED", entityType: "Admission", entityId: admissionId, metadata: { biometricIdentityId: identity.id, rosterStatus: "PENDING" } } });
      });
    } catch (error: any) {
      if (error?.code === "P2002") throw new BadRequestException("This Face Entry profile is already assigned to another admission for this event");
      throw error;
    }
    return { admissionId, biometricIdentityId: identity.id, faceEntryReady: true, requiresEnrollment: false, rosterStatus: "PENDING", message: "Face Entry habilitado" };
  }

  async createConsumerEnrollmentSession(
    consumerUserId: string,
    admissionId: string,
    input: { managementToken?: string; deviceId?: string; scope: BiometricConsentScope },
  ) {
    const linked = await this.activateForAdmission(consumerUserId, admissionId, input.managementToken);
    if (linked.faceEntryReady) return linked;
    const code = enrollmentCode();
    const session = await this.prisma.enrollmentSession.create({
      data: {
        eventId: (await this.prisma.admission.findUniqueOrThrow({ where: { id: admissionId }, select: { eventId: true } })).eventId,
        admissionId,
        deviceId: input.deviceId,
        consumerUserId,
        requestedScope: input.scope,
        codeHash: digestEventToken(code),
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    return { id: session.id, code, expiresAt: session.expiresAt, faceEntryReady: false, requiresEnrollment: true, scope: session.requestedScope };
  }

  async completeEnrollment(sessionId: string, dto: CompleteEnrollmentDto, authenticatedConsumerUserId?: string) {
    if (!dto.consent) throw new BadRequestException("Explicit biometric consent is required");
    if (dto.consentExpiresAt && new Date(dto.consentExpiresAt) <= new Date()) {
      throw new BadRequestException("Biometric consent expiry must be in the future");
    }
    const session = await this.prisma.enrollmentSession.findFirst({
      where: { id: sessionId, codeHash: digestEventToken(dto.code), consumedAt: null, failedAt: null, expiresAt: { gt: new Date() } },
      include: { admission: { include: { attendee: true, order: true, event: true } }, consumerUser: true },
    });
    if (!session) throw new BadRequestException("Enrollment session is invalid, expired, or already used");
    if (session.consumerUserId && session.consumerUserId !== authenticatedConsumerUserId) throw new BadRequestException("This enrollment session belongs to another customer");
    if (session.requestedScope === BiometricConsentScope.REUSABLE && !session.consumerUserId) throw new BadRequestException("Reusable Face Entry requires an authenticated PagosYa account");
    if (!session.admission.event.venueId) throw new BadRequestException("This event must be assigned to a venue before biometric enrollment");
    const device = await this.prisma.accessDevice.findFirst({
      where: { id: dto.deviceId, venueId: session.admission.event.venueId, eventId: session.eventId, role: { in: ["ENROLLMENT", "BIDIRECTIONAL"] }, status: { not: "DISABLED" } },
    });
    if (!device) throw new BadRequestException("Enrollment device is unavailable or is not assigned to this event");

    const attendee = session.admission.attendeeId
      ? await this.prisma.attendee.findUniqueOrThrow({ where: { id: session.admission.attendeeId } })
      : await this.prisma.attendee.create({ data: { merchantId: session.admission.order.merchantId, eventId: session.eventId, displayName: dto.displayName.trim(), email: dto.email?.trim().toLowerCase(), phone: dto.phone?.trim() } });
    const biometricIdentityId = `bio_${secureToken(18)}`;
    const externalPersonId = `person-${secureToken(12)}`;
    let enrolled: EnrollmentResult | undefined;
    try {
      const eventEndsAt = session.admission.event.endsAt ?? session.admission.event.startsAt;
      const eventRetentionUntil = new Date(eventEndsAt.getTime() + session.admission.event.retentionHours * 60 * 60_000);
      enrolled = await this.provider.enrollPerson({
        device: this.rosters.deviceInput(device),
        biometricIdentityId,
        eventId: session.eventId,
        externalPersonId,
        displayName: attendee.displayName,
        expiresAt: eventRetentionUntil.toISOString(),
        enrollmentReference: session.id,
      });
      const provider = device.vendor.toLowerCase() === "mock" ? BiometricProvider.MOCK : BiometricProvider.ZKTECO;
      const reusable = session.requestedScope === BiometricConsentScope.REUSABLE;
      const providerExternalId = enrolled.providerExternalId ?? (provider === BiometricProvider.MOCK ? enrolled.externalCredentialId : null);
      return await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.enrollmentSession.updateMany({ where: { id: session.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date(), deviceId: device.id } });
        if (!consumed.count) throw new BadRequestException("Enrollment session was already consumed");
        const identity = await tx.biometricIdentity.create({
          data: {
            id: biometricIdentityId,
            consumerUserId: session.consumerUserId,
            provider,
            reusableAcrossEvents: reusable,
            providerExternalId,
            algorithmVersion: enrolled!.algorithmVersion ?? device.algorithmVersion,
            encryptedTemplateReference: enrolled!.encryptedTemplateReference,
            encryptedVendorPayload: enrolled!.encryptedVendorPayload,
            lastVerifiedAt: new Date(enrolled!.enrolledAt),
            metadata: { enrollmentQuality: enrolled!.quality, portability: provider === BiometricProvider.MOCK ? "SIMULATED" : "UNCONFIRMED" },
          },
        });
        const consent = await tx.biometricConsent.create({
          data: {
            eventId: session.eventId,
            attendeeId: attendee.id,
            admissionId: session.admissionId,
            consumerUserId: session.consumerUserId,
            biometricIdentityId: identity.id,
            scope: session.requestedScope,
            version: dto.consentVersion,
            purpose: reusable ? "PagosYa Face Entry para eventos compatibles" : `Acceso a ${session.admission.event.name}`,
            consentedAt: new Date(),
            expiresAt: dto.consentExpiresAt ? new Date(dto.consentExpiresAt) : null,
            retentionUntil: reusable ? null : eventRetentionUntil,
          },
        });
        await tx.biometricIdentity.update({ where: { id: identity.id }, data: { activeConsentId: consent.id } });
        await tx.biometricCredential.create({
          data: {
            biometricIdentityId: identity.id,
            provider,
            providerExternalId,
            algorithmVersion: enrolled!.algorithmVersion ?? device.algorithmVersion,
            encryptedTemplateReference: enrolled!.encryptedTemplateReference,
            encryptedVendorPayload: enrolled!.encryptedVendorPayload,
            enrolledAt: new Date(enrolled!.enrolledAt),
            lastVerifiedAt: new Date(enrolled!.enrolledAt),
            metadata: { quality: enrolled!.quality, deviceEnrollment: true },
          },
        });
        await tx.eventBiometricAuthorization.create({ data: { eventId: session.eventId, admissionId: session.admissionId, attendeeId: attendee.id, biometricIdentityId: identity.id, consentId: consent.id } });
        await tx.devicePersonMapping.create({
          data: {
            deviceId: device.id,
            eventId: session.eventId,
            biometricIdentityId: identity.id,
            externalPersonId,
            syncStatus: DevicePersonSyncStatus.SYNCED,
            syncedAt: new Date(enrolled!.enrolledAt),
            algorithmVersion: enrolled!.algorithmVersion ?? device.algorithmVersion,
          },
        });
        await tx.admission.update({ where: { id: session.admissionId }, data: { attendeeId: attendee.id, assignmentStatus: "CLAIMED", biometricEnrollmentStatus: BiometricEnrollmentStatus.ENROLLED } });
        await tx.eventAuditLog.create({ data: { merchantId: session.admission.order.merchantId, eventId: session.eventId, action: reusable ? "REUSABLE_FACE_ENTRY_ENROLLED" : "EVENT_ONLY_FACE_ENROLLED", entityType: "BiometricIdentity", entityId: identity.id, metadata: { deviceId: device.id, consentScope: session.requestedScope } } });
        return { admissionId: session.admissionId, attendeeId: attendee.id, biometricIdentityId: identity.id, externalPersonId, status: "ENROLLED", reusableAcrossEvents: reusable, faceEntryReady: true };
      });
    } catch (error) {
      if (enrolled) await this.provider.deletePerson({ device: this.rosters.deviceInput(device), eventId: session.eventId, externalPersonId }).catch(() => undefined);
      await this.prisma.enrollmentSession.updateMany({ where: { id: session.id, consumedAt: null }, data: { failedAt: new Date() } });
      await this.prisma.admission.update({ where: { id: session.admissionId }, data: { biometricEnrollmentStatus: BiometricEnrollmentStatus.FAILED } });
      throw error;
    }
  }

  async accountStatus(consumerUserId: string) {
    const identity = await this.prisma.biometricIdentity.findFirst({
      where: { consumerUserId, reusableAcrossEvents: true, status: { not: BiometricIdentityStatus.DELETED } },
      include: { _count: { select: { authorizations: true } }, activeConsent: { select: { version: true, consentedAt: true, expiresAt: true, revokedAt: true } } },
      orderBy: { updatedAt: "desc" },
    });
    if (!identity) return { registered: false, status: "NOT_ENROLLED", requiresEnrollment: true };
    return {
      registered: identity.status === BiometricIdentityStatus.ACTIVE,
      status: identity.status,
      biometricIdentityId: identity.id,
      registeredSince: identity.createdAt,
      lastVerifiedAt: identity.lastVerifiedAt,
      eventsUsed: identity._count.authorizations,
      consent: identity.activeConsent,
      requiresEnrollment: identity.status !== BiometricIdentityStatus.ACTIVE,
    };
  }

  async deleteForConsumer(consumerUserId: string, reason: string) {
    const identity = await this.prisma.biometricIdentity.findFirst({ where: { consumerUserId, reusableAcrossEvents: true, status: { not: BiometricIdentityStatus.DELETED } }, orderBy: { updatedAt: "desc" } });
    if (!identity) return { status: "COMPLETED", alreadyDeleted: true };
    return this.rosters.deleteIdentity(identity.id, reason, { consumerUserId });
  }

  async deleteForEventAdmin(merchantId: string, biometricIdentityId: string, eventId: string, actorUserId: string | undefined, reason: string) {
    const authorization = await this.prisma.eventBiometricAuthorization.findFirst({ where: { biometricIdentityId, eventId, event: { merchantId } } });
    if (!authorization) throw new NotFoundException("Biometric identity not found for event");
    return this.rosters.deleteIdentity(biometricIdentityId, reason, { eventId, actorUserId });
  }
}
