import type {
  AccessControlDevice, AccessControlProvider, DeletePersonInput, DeviceEventHandler, DeviceHealth,
  EnrollPersonInput, EnrollmentResult, NormalizedDeviceEvent, RecentEventsInput, SyncEventRosterInput,
  RemoveEventRosterInput, SyncPersonInput, SyncResult, UnlockDoorInput,
} from "./types";

export type ZKTecoIntegrationMode = "push" | "sdk";

export interface ZKTecoSpeedFaceConfig {
  mode: ZKTecoIntegrationMode;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

export class ZKTecoDocumentationRequiredError extends Error {
  constructor(operation: string) {
    super(`ZKTeco SpeedFace-V5 ${operation} is unavailable: official SDK/PUSH/ADMS protocol documentation has not been supplied`);
    this.name = "ZKTecoDocumentationRequiredError";
  }
}

/**
 * Deliberately isolated, fail-closed skeleton.
 *
 * No URL, command, payload, authentication sequence, port default, or event
 * parsing behavior is implemented here because none is documented in this
 * repository. See docs/ZKTECO_INTEGRATION.md before adding a transport.
 */
export class ZKTecoSpeedFaceProvider implements AccessControlProvider {
  constructor(readonly config: Readonly<ZKTecoSpeedFaceConfig>) {}
  healthCheck(_device: AccessControlDevice): Promise<DeviceHealth> { return Promise.reject(new ZKTecoDocumentationRequiredError("health check")); }
  enrollPerson(_input: EnrollPersonInput): Promise<EnrollmentResult> { return Promise.reject(new ZKTecoDocumentationRequiredError("person enrollment")); }
  deletePerson(_input: DeletePersonInput): Promise<void> { return Promise.reject(new ZKTecoDocumentationRequiredError("person deletion")); }
  syncPerson(_input: SyncPersonInput): Promise<void> { return Promise.reject(new ZKTecoDocumentationRequiredError("person synchronization")); }
  syncEventRoster(_input: SyncEventRosterInput): Promise<SyncResult> { return Promise.reject(new ZKTecoDocumentationRequiredError("event roster synchronization")); }
  removeEventRoster(_input: RemoveEventRosterInput): Promise<SyncResult> { return Promise.reject(new ZKTecoDocumentationRequiredError("event roster removal")); }
  listenForEvents(_handler: DeviceEventHandler): Promise<() => void> { return Promise.reject(new ZKTecoDocumentationRequiredError("event listener")); }
  getRecentEvents(_input: RecentEventsInput): Promise<NormalizedDeviceEvent[]> { return Promise.reject(new ZKTecoDocumentationRequiredError("event retrieval")); }
  unlockDoor(_input: UnlockDoorInput): Promise<void> { return Promise.reject(new ZKTecoDocumentationRequiredError("door unlock")); }
}
