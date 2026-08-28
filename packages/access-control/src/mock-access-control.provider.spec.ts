import { MockAccessControlProvider } from "./mock-access-control.provider";

const device = { id: "device-1", name: "Puerta", vendor: "Mock", model: "Simulator", role: "ENTRY" as const };

describe("MockAccessControlProvider", () => {
  it("enrolls independent people and emits production-shaped recognition events", async () => {
    const provider = new MockAccessControlProvider();
    const received: string[] = [];
    await provider.listenForEvents((event) => { received.push(event.eventType); });
    await provider.enrollPerson({ device, eventId: "event-1", externalPersonId: "person-a", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await provider.enrollPerson({ device, eventId: "event-1", externalPersonId: "person-b", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const event = await provider.recognize({ deviceId: device.id, externalPersonId: "person-b", direction: "ENTRY" });
    expect(event).toMatchObject({ eventType: "RECOGNIZED_FACE", externalPersonId: "person-b", direction: "ENTRY", livenessPassed: true });
    expect(received).toEqual(["ENROLLMENT_SUCCESS", "ENROLLMENT_SUCCESS", "RECOGNIZED_FACE"]);
  });

  it("supports device outages, spoof rejection, unknown faces and duplicate event IDs", async () => {
    const provider = new MockAccessControlProvider();
    await provider.setDeviceOnline(device.id, false);
    await expect(provider.enrollPerson({ device, eventId: "event-1", externalPersonId: "person-a", expiresAt: new Date().toISOString() })).rejects.toThrow("DEVICE_OFFLINE");
    await provider.setDeviceOnline(device.id, true);
    expect((await provider.recognize({ deviceId: device.id, externalPersonId: "unknown", direction: "ENTRY" })).eventType).toBe("UNKNOWN_FACE");
    expect((await provider.spoof(device.id)).eventType).toBe("SPOOF_REJECTED");
  });
});
