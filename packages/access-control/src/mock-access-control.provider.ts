import { randomUUID } from "node:crypto";
import type {
  AccessControlDevice,
  AccessControlProvider,
  DeletePersonInput,
  DeviceEventHandler,
  DeviceHealth,
  EnrollPersonInput,
  EnrollmentResult,
  NormalizedDeviceEvent,
  RecentEventsInput,
  SyncEventRosterInput,
  SyncPersonInput,
  SyncResult,
  UnlockDoorInput,
} from "./types";

type MockPerson = EnrollmentResult & { eventId: string; expiresAt: string };

export class MockAccessControlProvider implements AccessControlProvider {
  private readonly health = new Map<string, DeviceHealth["status"]>();
  private readonly people = new Map<string, Map<string, MockPerson>>();
  private readonly events: NormalizedDeviceEvent[] = [];
  private readonly handlers = new Set<DeviceEventHandler>();
  private enrollmentFailureReason: string | null = null;

  async healthCheck(device: AccessControlDevice): Promise<DeviceHealth> {
    return { status: this.health.get(device.id) ?? "ONLINE", checkedAt: new Date().toISOString(), latencyMs: 1 };
  }

  failNextEnrollment(reason = "SIMULATED_ENROLLMENT_FAILURE"): void {
    this.enrollmentFailureReason = reason;
  }

  async enrollPerson(input: EnrollPersonInput): Promise<EnrollmentResult> {
    if ((this.health.get(input.device.id) ?? "ONLINE") !== "ONLINE") throw new Error("DEVICE_OFFLINE");
    if (this.enrollmentFailureReason) {
      const reason = this.enrollmentFailureReason;
      this.enrollmentFailureReason = null;
      await this.emit({
        externalEventId: randomUUID(), deviceId: input.device.id, occurredAt: new Date().toISOString(),
        eventType: "ENROLLMENT_FAILURE", externalPersonId: input.externalPersonId,
      });
      throw new Error(reason);
    }
    const result: EnrollmentResult = {
      externalPersonId: input.externalPersonId,
      externalCredentialId: `mock-credential-${randomUUID()}`,
      enrolledAt: new Date().toISOString(),
      quality: 0.99,
    };
    const devicePeople = this.people.get(input.device.id) ?? new Map<string, MockPerson>();
    devicePeople.set(input.externalPersonId, { ...result, eventId: input.eventId, expiresAt: input.expiresAt });
    this.people.set(input.device.id, devicePeople);
    await this.emit({
      externalEventId: randomUUID(), deviceId: input.device.id, occurredAt: result.enrolledAt,
      eventType: "ENROLLMENT_SUCCESS", externalPersonId: input.externalPersonId,
    });
    return result;
  }

  async deletePerson(input: DeletePersonInput): Promise<void> {
    this.people.get(input.device.id)?.delete(input.externalPersonId);
  }

  async syncPerson(input: SyncPersonInput): Promise<void> {
    await this.enrollPerson(input);
  }

  async syncEventRoster(input: SyncEventRosterInput): Promise<SyncResult> {
    const failed: Array<{ externalPersonId: string; reason: string }> = [];
    let succeeded = 0;
    for (const person of input.people) {
      try { await this.syncPerson(person); succeeded += 1; }
      catch (error) { failed.push({ externalPersonId: person.externalPersonId, reason: error instanceof Error ? error.message : "UNKNOWN" }); }
    }
    return { requested: input.people.length, succeeded, failed };
  }

  async listenForEvents(handler: DeviceEventHandler): Promise<() => void> {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async getRecentEvents(input: RecentEventsInput): Promise<NormalizedDeviceEvent[]> {
    const since = input.since ? Date.parse(input.since) : Number.NEGATIVE_INFINITY;
    return this.events.filter((event) => event.deviceId === input.device.id && Date.parse(event.occurredAt) >= since).slice(-(input.limit ?? 100));
  }

  async unlockDoor(_input: UnlockDoorInput): Promise<void> { /* simulator acknowledgement */ }

  async setDeviceOnline(deviceId: string, online: boolean): Promise<NormalizedDeviceEvent> {
    this.health.set(deviceId, online ? "ONLINE" : "OFFLINE");
    return this.emit({
      externalEventId: randomUUID(), deviceId, occurredAt: new Date().toISOString(),
      eventType: online ? "DEVICE_ONLINE" : "DEVICE_OFFLINE",
    });
  }

  async recognize(input: { deviceId: string; externalPersonId: string; direction: "ENTRY" | "EXIT"; duplicateExternalEventId?: string }): Promise<NormalizedDeviceEvent> {
    const known = this.people.get(input.deviceId)?.has(input.externalPersonId) ?? false;
    return this.emit({
      externalEventId: input.duplicateExternalEventId ?? randomUUID(), deviceId: input.deviceId,
      occurredAt: new Date().toISOString(), eventType: known ? "RECOGNIZED_FACE" : "UNKNOWN_FACE",
      direction: input.direction, ...(known ? { externalPersonId: input.externalPersonId, matchConfidence: 0.99, livenessPassed: true } : {}),
    });
  }

  async spoof(deviceId: string, externalPersonId?: string): Promise<NormalizedDeviceEvent> {
    return this.emit({ externalEventId: randomUUID(), deviceId, occurredAt: new Date().toISOString(), eventType: "SPOOF_REJECTED", externalPersonId, livenessPassed: false });
  }

  async emit(event: NormalizedDeviceEvent): Promise<NormalizedDeviceEvent> {
    if (this.events.some((current) => current.externalEventId === event.externalEventId)) return event;
    this.events.push(Object.freeze({ ...event }));
    await Promise.all([...this.handlers].map((handler) => handler(event)));
    return event;
  }
}
