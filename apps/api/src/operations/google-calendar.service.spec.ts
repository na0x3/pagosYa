import { GoogleCalendarService } from "./google-calendar.service";

const appointment = {
  id: "appointment_1",
  customerName: "María Pérez",
  customerEmail: "maria@example.com",
  customerPhone: "+59170000000",
  startsAt: new Date("2099-08-26T18:00:00.000Z"),
  endsAt: new Date("2099-08-26T18:45:00.000Z"),
  notes: "Primera visita",
};

describe("GoogleCalendarService appointment synchronization", () => {
  afterEach(() => jest.restoreAllMocks());

  it("patches the existing Google event when a pagosYa appointment changes", async () => {
    const service = new GoogleCalendarService({} as any, {} as any);
    jest.spyOn(service, "accessTokenForStore").mockResolvedValue({ token: "access", calendarId: "primary" });
    const request = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "event_1" }), { status: 200 }));

    await expect(service.updateEvent("store_1", "event_1", "Estudio Norte", "Consulta facial", appointment)).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith(expect.stringContaining("/events/event_1?sendUpdates=all"), expect.objectContaining({ method: "PATCH" }));
    const payload = JSON.parse((request.mock.calls[0][1]?.body as string));
    expect(payload).toMatchObject({ summary: "Consulta facial · María Pérez", start: { dateTime: appointment.startsAt.toISOString() } });
  });

  it("deletes the existing Google event when a pagosYa appointment is canceled", async () => {
    const service = new GoogleCalendarService({} as any, {} as any);
    jest.spyOn(service, "accessTokenForStore").mockResolvedValue({ token: "access", calendarId: "primary" });
    const request = jest.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await expect(service.deleteEvent("store_1", "event_1")).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(expect.stringContaining("/events/event_1?sendUpdates=all"), expect.objectContaining({ method: "DELETE" }));
  });
});
