export type AccessDeviceRole = "ENTRY" | "EXIT" | "BIDIRECTIONAL" | "ENROLLMENT";

export type NormalizedDeviceEventType =
  | "RECOGNIZED_FACE"
  | "UNKNOWN_FACE"
  | "SPOOF_REJECTED"
  | "DEVICE_OFFLINE"
  | "DEVICE_ONLINE"
  | "ENROLLMENT_SUCCESS"
  | "ENROLLMENT_FAILURE";

export type NormalizedAccessDirection = "ENTRY" | "EXIT";

export interface AccessControlDevice {
  id: string;
  name: string;
  vendor: string;
  model: string;
  role: AccessDeviceRole;
  host?: string;
  port?: number;
  faceCapacity?: number;
  algorithmVersion?: string;
  providerCapabilities?: Readonly<Record<string, unknown>>;
  configuration?: Readonly<Record<string, unknown>>;
  /** Encrypted-at-rest secret envelope. Providers receive it only at execution time. */
  encryptedSecrets?: string;
}

export interface BiometricProfileReference {
  biometricIdentityId: string;
  provider: "MOCK" | "ZKTECO" | "FUTURE_PROVIDER";
  providerExternalId?: string;
  algorithmVersion?: string;
  /** Opaque encrypted reference. Core access logic never interprets its contents. */
  encryptedTemplateReference?: string;
  /** Opaque encrypted provider envelope. It must never be written to logs. */
  encryptedVendorPayload?: string;
}

export interface DeviceHealth {
  status: "ONLINE" | "OFFLINE" | "DEGRADED" | "UNCONFIGURED";
  checkedAt: string;
  latencyMs?: number;
  firmwareVersion?: string;
  details?: Readonly<Record<string, string | number | boolean>>;
}

export interface EnrollPersonInput {
  device: AccessControlDevice;
  biometricIdentityId: string;
  externalPersonId: string;
  displayName?: string;
  eventId: string;
  expiresAt: string;
  /** A provider-specific opaque enrollment session reference, never a face template. */
  enrollmentReference?: string;
}

export interface EnrollmentResult {
  externalPersonId: string;
  externalCredentialId: string;
  enrolledAt: string;
  quality?: number;
  algorithmVersion?: string;
  /** Provider-owned opaque identifier, not a globally portable person ID. */
  providerExternalId?: string;
  /**
   * Optional provider-produced central references. A future documented adapter
   * may return either value; core code stores but never parses or logs them.
   */
  encryptedTemplateReference?: string;
  encryptedVendorPayload?: string;
}

export interface DeletePersonInput {
  device: AccessControlDevice;
  externalPersonId: string;
  eventId: string;
}

export interface SyncPersonInput extends EnrollPersonInput {
  externalCredentialId?: string;
  profile: BiometricProfileReference;
}

export interface SyncEventRosterInput {
  device: AccessControlDevice;
  eventId: string;
  people: ReadonlyArray<SyncPersonInput>;
}

export interface SyncResult {
  requested: number;
  succeeded: number;
  unchanged?: number;
  removed?: number;
  failed: ReadonlyArray<{ externalPersonId: string; reason: string }>;
}

export interface RemoveEventRosterInput {
  device: AccessControlDevice;
  eventId: string;
  people: ReadonlyArray<{ externalPersonId: string; biometricIdentityId: string }>;
}

export interface RecentEventsInput {
  device: AccessControlDevice;
  since?: string;
  limit?: number;
}

export interface UnlockDoorInput {
  device: AccessControlDevice;
  reason: string;
  requestedBy: string;
}

export interface NormalizedDeviceEvent {
  externalEventId: string;
  deviceId: string;
  occurredAt: string;
  eventType: NormalizedDeviceEventType;
  direction?: NormalizedAccessDirection;
  externalPersonId?: string;
  matchConfidence?: number;
  livenessPassed?: boolean;
  rawVendorEventReference?: string;
}

export type DeviceEventHandler = (event: NormalizedDeviceEvent) => Promise<void> | void;

export interface AccessControlProvider {
  healthCheck(device: AccessControlDevice): Promise<DeviceHealth>;
  enrollPerson(input: EnrollPersonInput): Promise<EnrollmentResult>;
  deletePerson(input: DeletePersonInput): Promise<void>;
  syncPerson(input: SyncPersonInput): Promise<void>;
  syncEventRoster(input: SyncEventRosterInput): Promise<SyncResult>;
  removeEventRoster(input: RemoveEventRosterInput): Promise<SyncResult>;
  listenForEvents(handler: DeviceEventHandler): Promise<() => void>;
  getRecentEvents(input: RecentEventsInput): Promise<NormalizedDeviceEvent[]>;
  unlockDoor?(input: UnlockDoorInput): Promise<void>;
}

/** Future phone enrollment boundary. No selfie matching implementation is included. */
export interface RemoteBiometricEnrollmentProvider {
  createSession(input: { eventId: string; admissionId: string; consentId: string }): Promise<{ sessionId: string; expiresAt: string }>;
  getResult(sessionId: string): Promise<{ status: "PENDING" | "ENROLLED" | "FAILED"; externalCredentialId?: string }>;
  deleteResult(sessionId: string): Promise<void>;
}
