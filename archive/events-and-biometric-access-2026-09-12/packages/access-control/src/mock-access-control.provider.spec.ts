import { MockAccessControlProvider } from "./mock-access-control.provider";

const device = { id: "device-1", name: "Puerta", vendor: "Mock", model: "Simulator", role: "ENTRY" as const };

describe("MockAccessControlProvider", () => {
  it("enrolls independent people and emits production-shaped recognition events", async () => {
    const provider = new MockAccessControlProvider();
    const received: string[] = [];
    await provider.listenForEvents((event) => { received.push(event.eventType); });
    await provider.enrollPerson({ device, biometricIdentityId: "bio-a", eventId: "event-1", externalPersonId: "person-a", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await provider.enrollPerson({ device, biometricIdentityId: "bio-b", eventId: "event-1", externalPersonId: "person-b", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const event = await provider.recognize({ deviceId: device.id, externalPersonId: "person-b", direction: "ENTRY" });
    expect(event).toMatchObject({ eventType: "RECOGNIZED_FACE", externalPersonId: "person-b", direction: "ENTRY", livenessPassed: true });
    expect(received).toEqual(["ENROLLMENT_SUCCESS", "ENROLLMENT_SUCCESS", "RECOGNIZED_FACE"]);
  });

  it("supports device outages, spoof rejection, unknown faces and duplicate event IDs", async () => {
    const provider = new MockAccessControlProvider();
    await provider.setDeviceOnline(device.id, false);
    await expect(provider.enrollPerson({ device, biometricIdentityId: "bio-a", eventId: "event-1", externalPersonId: "person-a", expiresAt: new Date().toISOString() })).rejects.toThrow("DEVICE_OFFLINE");
    await provider.setDeviceOnline(device.id, true);
    expect((await provider.recognize({ deviceId: device.id, externalPersonId: "unknown", direction: "ENTRY" })).eventType).toBe("UNKNOWN_FACE");
    expect((await provider.spoof(device.id)).eventType).toBe("SPOOF_REJECTED");
  });

  it("treats each device roster as an event-specific cache of a reusable identity", async () => {
    const provider = new MockAccessControlProvider();
    const secondDevice = { ...device, id: "device-2", name: "Puerta B" };
    const profile = { biometricIdentityId: "bio-maria", provider: "MOCK" as const, providerExternalId: "mock-central-maria", algorithmVersion: "MOCK-v1" };
    await provider.syncEventRoster({
      device,
      eventId: "event-a",
      people: [{ device, eventId: "event-a", biometricIdentityId: profile.biometricIdentityId, externalPersonId: "person-a-8291", expiresAt: new Date(Date.now() + 60_000).toISOString(), profile }],
    });
    expect(provider.getDeviceRoster(device.id, "event-a")).toHaveLength(1);
    await provider.removeEventRoster({ device, eventId: "event-a", people: [{ biometricIdentityId: profile.biometricIdentityId, externalPersonId: "person-a-8291" }] });
    expect(provider.getDeviceRoster(device.id, "event-a")).toHaveLength(0);
    await provider.syncEventRoster({
      device: secondDevice,
      eventId: "event-b",
      people: [{ device: secondDevice, eventId: "event-b", biometricIdentityId: profile.biometricIdentityId, externalPersonId: "person-b-5512", expiresAt: new Date(Date.now() + 60_000).toISOString(), profile }],
    });
    expect(provider.getDeviceRoster(secondDevice.id, "event-b")[0]).toMatchObject({ biometricIdentityId: "bio-maria", externalPersonId: "person-b-5512" });
  });
});
