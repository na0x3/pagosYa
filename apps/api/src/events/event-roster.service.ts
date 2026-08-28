import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  AdmissionStatus,
  BiometricConsentScope,
  BiometricIdentityStatus,
  BiometricProvider,
  DevicePersonSyncStatus,
  EventBiometricAuthorizationStatus,
  EventPaymentStatus,
  EventStatus,
  Prisma,
} from "@prisma/client";
import type { AccessControlDevice, AccessControlProvider, SyncPersonInput } from "@pagosya/access-control";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { ACCESS_CONTROL_PROVIDER } from "./access-control.provider";

const activeAdmissionStatuses = [AdmissionStatus.ACTIVE, AdmissionStatus.VALID];

type DeviceRecord = {
  id: string;
  name: string;
  vendor: string;
  model: string;
  role: string;
  ipAddress: string | null;
  port: number | null;
  faceCapacity: number | null;
  algorithmVersion: string | null;
  providerCapabilities: Prisma.JsonValue;
  configuration: Prisma.JsonValue;
  encryptedSecrets: string | null;
};

@Injectable()
export class EventRosterService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACCESS_CONTROL_PROVIDER) private readonly provider: AccessControlProvider,
  ) {}

  deviceInput(device: DeviceRecord): AccessControlDevice {
    const objectValue = (value: Prisma.JsonValue) => value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
    return {
      id: device.id,
      name: device.name,
      vendor: device.vendor,
      model: device.model,
      role: device.role as AccessControlDevice["role"],
      host: device.ipAddress ?? undefined,
      port: device.port ?? undefined,
      faceCapacity: device.faceCapacity ?? undefined,
      algorithmVersion: device.algorithmVersion ?? undefined,
      providerCapabilities: objectValue(device.providerCapabilities),
      configuration: objectValue(device.configuration),
      encryptedSecrets: device.encryptedSecrets ?? undefined,
    };
  }

  private fingerprint(identity: {
    id: string;
    provider: BiometricProvider;
    providerExternalId: string | null;
    algorithmVersion: string | null;
    updatedAt: Date;
  }): string {
    return createHash("sha256")
      .update([identity.id, identity.provider, identity.providerExternalId ?? "", identity.algorithmVersion ?? "", identity.updatedAt.toISOString()].join("|"))
      .digest("hex");
  }

  async syncEventRoster(merchantId: string, eventId: string, deviceId: string, actorUserId?: string) {
    const now = new Date();
    const [event, device] = await Promise.all([
      this.prisma.event.findFirst({ where: { id: eventId, merchantId }, select: { id: true, name: true, endsAt: true, startsAt: true, retentionHours: true } }),
      this.prisma.accessDevice.findFirst({ where: { id: deviceId, merchantId, eventId } }),
    ]);
    if (!event) throw new NotFoundException("Event not found");
    if (!device) throw new NotFoundException("Device is not assigned to this event");
    if (!device.faceCapacity || device.faceCapacity < 1) {
      throw new BadRequestException("DEVICE_FACE_CAPACITY_NOT_CONFIGURED");
    }

    const desired = await this.prisma.eventBiometricAuthorization.findMany({
      where: {
        eventId,
        status: EventBiometricAuthorizationStatus.AUTHORIZED,
        admission: {
          status: { in: activeAdmissionStatuses },
          biometricEnrollmentStatus: "ENROLLED",
          order: { paymentStatus: EventPaymentStatus.PAID },
        },
        biometricIdentity: { status: BiometricIdentityStatus.ACTIVE },
        consent: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      },
      include: {
        attendee: { select: { displayName: true } },
        biometricIdentity: true,
      },
      orderBy: { createdAt: "asc" },
    });
    if (desired.length > device.faceCapacity) {
      throw new BadRequestException({
        code: "DEVICE_FACE_CAPACITY_EXCEEDED",
        desiredRosterSize: desired.length,
        faceCapacity: device.faceCapacity,
      });
    }

    const current = await this.prisma.devicePersonMapping.findMany({ where: { deviceId, eventId } });
    const currentByIdentity = new Map(current.map((mapping) => [mapping.biometricIdentityId, mapping]));
    const desiredIds = new Set<string>();
    const expiresAt = new Date((event.endsAt ?? event.startsAt).getTime() + event.retentionHours * 60 * 60_000).toISOString();
    const inputs: SyncPersonInput[] = [];
    const unchanged: string[] = [];

    for (const authorization of desired) {
      const identity = authorization.biometricIdentity;
      if (device.algorithmVersion && identity.algorithmVersion && device.algorithmVersion !== identity.algorithmVersion) {
        await this.prisma.biometricIdentity.update({
          where: { id: identity.id },
          data: { status: BiometricIdentityStatus.REQUIRES_REENROLLMENT, reenrollmentReason: "ALGORITHM_INCOMPATIBLE" },
        });
        continue;
      }
      desiredIds.add(identity.id);
      const existing = currentByIdentity.get(identity.id);
      const contentFingerprint = this.fingerprint(identity);
      if (existing?.syncStatus === DevicePersonSyncStatus.SYNCED && existing.contentFingerprint === contentFingerprint) {
        unchanged.push(identity.id);
        continue;
      }
      const externalPersonId = existing?.externalPersonId ?? `person-${randomUUID()}`;
      await this.prisma.devicePersonMapping.upsert({
        where: { deviceId_eventId_biometricIdentityId: { deviceId, eventId, biometricIdentityId: identity.id } },
        create: {
          deviceId,
          eventId,
          biometricIdentityId: identity.id,
          externalPersonId,
          syncStatus: DevicePersonSyncStatus.SYNCING,
          contentFingerprint,
          algorithmVersion: identity.algorithmVersion,
          lastAttemptedAt: now,
        },
        update: {
          externalPersonId,
          syncStatus: DevicePersonSyncStatus.SYNCING,
          contentFingerprint,
          algorithmVersion: identity.algorithmVersion,
          lastAttemptedAt: now,
          removedAt: null,
          lastError: null,
        },
      });
      inputs.push({
        device: this.deviceInput(device),
        eventId,
        biometricIdentityId: identity.id,
        externalPersonId,
        displayName: authorization.attendee.displayName,
        expiresAt,
        externalCredentialId: identity.providerExternalId ?? undefined,
        profile: {
          biometricIdentityId: identity.id,
          provider: identity.provider,
          providerExternalId: identity.providerExternalId ?? undefined,
          algorithmVersion: identity.algorithmVersion ?? undefined,
          encryptedTemplateReference: identity.encryptedTemplateReference ?? undefined,
          encryptedVendorPayload: identity.encryptedVendorPayload ?? undefined,
        },
      });
    }

    let syncResult: { requested: number; succeeded: number; failed: ReadonlyArray<{ externalPersonId: string; reason: string }> };
    try {
      syncResult = inputs.length
        ? await this.provider.syncEventRoster({ device: this.deviceInput(device), eventId, people: inputs })
        : { requested: 0, succeeded: 0, failed: [] };
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 240) : "DEVICE_SYNC_FAILED";
      await this.prisma.devicePersonMapping.updateMany({
        where: { deviceId, eventId, biometricIdentityId: { in: inputs.map((input) => input.biometricIdentityId) } },
        data: { syncStatus: DevicePersonSyncStatus.FAILED, lastError: reason, lastAttemptedAt: new Date() },
      });
      throw error;
    }
    const failures = new Map(syncResult.failed.map((failure) => [failure.externalPersonId, failure.reason]));
    for (const input of inputs) {
      const failure = failures.get(input.externalPersonId);
      await this.prisma.devicePersonMapping.update({
        where: { deviceId_eventId_biometricIdentityId: { deviceId, eventId, biometricIdentityId: input.biometricIdentityId } },
        data: failure
          ? { syncStatus: DevicePersonSyncStatus.FAILED, lastError: failure.slice(0, 240) }
          : { syncStatus: DevicePersonSyncStatus.SYNCED, syncedAt: new Date(), lastError: null },
      });
    }

    const removals = current.filter((mapping) => !desiredIds.has(mapping.biometricIdentityId) && mapping.syncStatus !== DevicePersonSyncStatus.REMOVED);
    let removalResult: { requested: number; succeeded: number; failed: ReadonlyArray<{ externalPersonId: string; reason: string }> };
    try {
      removalResult = removals.length
        ? await this.provider.removeEventRoster({
          device: this.deviceInput(device),
          eventId,
          people: removals.map((mapping) => ({ externalPersonId: mapping.externalPersonId, biometricIdentityId: mapping.biometricIdentityId })),
        })
        : { requested: 0, succeeded: 0, failed: [] };
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 240) : "DEVICE_REMOVAL_FAILED";
      await this.prisma.devicePersonMapping.updateMany({
        where: { id: { in: removals.map((mapping) => mapping.id) } },
        data: { syncStatus: DevicePersonSyncStatus.FAILED, lastError: reason, lastAttemptedAt: new Date() },
      });
      throw error;
    }
    const removalFailures = new Map(removalResult.failed.map((failure) => [failure.externalPersonId, failure.reason]));
    for (const mapping of removals) {
      const failure = removalFailures.get(mapping.externalPersonId);
      await this.prisma.devicePersonMapping.update({
        where: { id: mapping.id },
        data: failure
          ? { syncStatus: DevicePersonSyncStatus.FAILED, lastError: failure.slice(0, 240), lastAttemptedAt: new Date() }
          : { syncStatus: DevicePersonSyncStatus.REMOVED, removedAt: new Date(), lastError: null, lastAttemptedAt: new Date() },
      });
    }

    await this.prisma.eventAuditLog.create({
      data: {
        merchantId,
        eventId,
        actorUserId,
        action: "EVENT_ROSTER_SYNCED",
        entityType: "AccessDevice",
        entityId: deviceId,
        metadata: {
          desired: desired.length,
          addedOrUpdated: inputs.length,
          unchanged: unchanged.length,
          removed: removalResult.succeeded,
          failed: syncResult.failed.length + removalResult.failed.length,
        },
      },
    });
    return {
      eventId,
      deviceId,
      desired: desired.length,
      capacity: device.faceCapacity,
      addedOrUpdated: syncResult.succeeded,
      unchanged: unchanged.length,
      removed: removalResult.succeeded,
      failed: [...syncResult.failed, ...removalResult.failed],
    };
  }

  async removeEventRoster(merchantId: string, eventId: string, deviceId: string, actorUserId?: string) {
    const device = await this.prisma.accessDevice.findFirst({ where: { id: deviceId, eventId, merchantId } });
    if (!device) throw new NotFoundException("Device is not assigned to this event");
    const mappings = await this.prisma.devicePersonMapping.findMany({
      where: { deviceId, eventId, syncStatus: { not: DevicePersonSyncStatus.REMOVED } },
    });
    if (!mappings.length) return { eventId, deviceId, requested: 0, removed: 0, failed: [] };
    await this.prisma.devicePersonMapping.updateMany({
      where: { id: { in: mappings.map((mapping) => mapping.id) } },
      data: { syncStatus: DevicePersonSyncStatus.REMOVAL_PENDING, lastAttemptedAt: new Date() },
    });
    let result: { requested: number; succeeded: number; failed: ReadonlyArray<{ externalPersonId: string; reason: string }> };
    try {
      result = await this.provider.removeEventRoster({
        device: this.deviceInput(device),
        eventId,
        people: mappings.map((mapping) => ({ externalPersonId: mapping.externalPersonId, biometricIdentityId: mapping.biometricIdentityId })),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 240) : "DEVICE_REMOVAL_FAILED";
      await this.prisma.devicePersonMapping.updateMany({
        where: { id: { in: mappings.map((mapping) => mapping.id) } },
        data: { syncStatus: DevicePersonSyncStatus.FAILED, lastError: reason, lastAttemptedAt: new Date() },
      });
      throw error;
    }
    const failures = new Map(result.failed.map((failure) => [failure.externalPersonId, failure.reason]));
    for (const mapping of mappings) {
      const failure = failures.get(mapping.externalPersonId);
      await this.prisma.devicePersonMapping.update({
        where: { id: mapping.id },
        data: failure
          ? { syncStatus: DevicePersonSyncStatus.FAILED, lastError: failure.slice(0, 240) }
          : { syncStatus: DevicePersonSyncStatus.REMOVED, removedAt: new Date(), lastError: null },
      });
    }
    await this.prisma.eventAuditLog.create({
      data: { merchantId, eventId, actorUserId, action: "EVENT_ROSTER_REMOVED", entityType: "AccessDevice", entityId: deviceId, metadata: { requested: result.requested, removed: result.succeeded, failed: result.failed.length } },
    });
    return { eventId, deviceId, requested: result.requested, removed: result.succeeded, failed: result.failed };
  }

  async cleanupEndedEvent(merchantId: string, eventId: string, actorUserId?: string, now = new Date()) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, merchantId }, include: { devices: true } });
    if (!event) throw new NotFoundException("Event not found");
    if (event.status !== EventStatus.ENDED) throw new BadRequestException("Event must be ENDED before biometric cleanup");
    const rosterResults = [];
    for (const device of event.devices) rosterResults.push(await this.removeEventRoster(merchantId, eventId, device.id, actorUserId));

    const eventOnly = await this.prisma.eventBiometricAuthorization.findMany({
      where: {
        eventId,
        biometricIdentity: { reusableAcrossEvents: false, status: { not: BiometricIdentityStatus.DELETED } },
        consent: { scope: BiometricConsentScope.EVENT_ONLY, retentionUntil: { lte: now } },
      },
      select: { biometricIdentityId: true },
    });
    const deletedIdentityIds: string[] = [];
    for (const { biometricIdentityId } of eventOnly) {
      await this.deleteIdentity(biometricIdentityId, "EVENT_RETENTION_EXPIRED", { eventId, actorUserId });
      deletedIdentityIds.push(biometricIdentityId);
    }
    return { eventId, rosterResults, deletedIdentityIds };
  }

  async deleteIdentity(
    biometricIdentityId: string,
    reason: string,
    authorization: { consumerUserId?: string; eventId?: string; actorUserId?: string },
  ) {
    const identity = await this.prisma.biometricIdentity.findUnique({
      where: { id: biometricIdentityId },
      include: {
        deviceMappings: { where: { syncStatus: { not: DevicePersonSyncStatus.REMOVED } }, include: { device: true } },
        authorizations: { include: { event: { select: { merchantId: true } } } },
      },
    });
    if (!identity || identity.status === BiometricIdentityStatus.DELETED) return { status: "COMPLETED", alreadyDeleted: true };
    if (authorization.consumerUserId && identity.consumerUserId !== authorization.consumerUserId) throw new NotFoundException("Face Entry identity not found");
    if (authorization.eventId && !identity.authorizations.some((item) => item.eventId === authorization.eventId)) throw new NotFoundException("Face Entry identity not found for event");

    const job = await this.prisma.biometricDeletionJob.create({
      data: { eventId: authorization.eventId, biometricIdentityId, requestedById: authorization.actorUserId ?? authorization.consumerUserId, reason, status: "PROCESSING", startedAt: new Date(), attempts: 1 },
    });
    try {
      for (const mapping of identity.deviceMappings) {
        await this.provider.deletePerson({ device: this.deviceInput(mapping.device), eventId: mapping.eventId, externalPersonId: mapping.externalPersonId });
      }
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.devicePersonMapping.updateMany({ where: { biometricIdentityId, syncStatus: { not: DevicePersonSyncStatus.REMOVED } }, data: { syncStatus: DevicePersonSyncStatus.REMOVED, removedAt: now, lastError: null } });
        await tx.eventBiometricAuthorization.updateMany({ where: { biometricIdentityId, status: EventBiometricAuthorizationStatus.AUTHORIZED }, data: { status: EventBiometricAuthorizationStatus.REVOKED, revokedAt: now } });
        await tx.biometricConsent.updateMany({ where: { biometricIdentityId, revokedAt: null }, data: { revokedAt: now } });
        await tx.biometricCredential.updateMany({ where: { biometricIdentityId, deletedAt: null }, data: { deletedAt: now, encryptedTemplateReference: null, encryptedVendorPayload: null, providerExternalId: null, metadata: Prisma.JsonNull } });
        await tx.biometricIdentity.update({ where: { id: biometricIdentityId }, data: { status: BiometricIdentityStatus.DELETED, reusableAcrossEvents: false, activeConsentId: null, providerExternalId: null, encryptedTemplateReference: null, encryptedVendorPayload: null, metadata: Prisma.JsonNull, deletedAt: now } });
        await tx.admission.updateMany({ where: { biometricAuthorization: { biometricIdentityId } }, data: { biometricEnrollmentStatus: "DELETED" } });
        await tx.biometricDeletionJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: now } });
        for (const eventAuthorization of identity.authorizations) {
          await tx.eventAuditLog.create({
            data: { actorUserId: authorization.actorUserId, merchantId: eventAuthorization.event.merchantId, eventId: eventAuthorization.eventId, action: "BIOMETRIC_IDENTITY_DELETED", entityType: "BiometricIdentity", entityId: biometricIdentityId, metadata: { reason, centralIdentity: true } },
          });
        }
        if (authorization.consumerUserId) {
          await tx.auditLogEntry.create({
            data: { actorType: "CONSUMER_USER", actorId: authorization.consumerUserId, actorLabel: `consumer-user:${authorization.consumerUserId}`, action: "FACE_ENTRY_DELETED", targetType: "BiometricIdentity", targetId: biometricIdentityId, metadata: { reason, retainedEvidence: ["PAYMENTS", "ADMISSIONS", "ACCESS_AUDIT"] } },
          });
        }
      });
      return { jobId: job.id, status: "COMPLETED" };
    } catch (error) {
      await this.prisma.biometricDeletionJob.update({ where: { id: job.id }, data: { status: "FAILED", failureReason: error instanceof Error ? error.message.slice(0, 240) : "UNKNOWN" } });
      throw error;
    }
  }
}
