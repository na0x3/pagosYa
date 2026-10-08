import { ComplaintActor, ComplaintEventType, ComplaintStatus } from "@prisma/client";
import { ComplaintIntakeService } from "./complaint-intake.service";
import { createComplaintToken } from "./complaint-token";

const NOW = new Date("2026-10-08T19:00:00Z");
const dto = { buyerName: "Ana Pérez", buyerEmail: "ana@example.com", reference: "pi_abc123", category: "NOT_DELIVERED", request: "REFUND", description: "Pagué hace dos semanas y nunca llegó el pedido." } as any;
const config = { get: (key: string) => ({ "app.checkoutOrigin": "https://checkout.pagosya.bo", "app.orderTrackingSecret": "s" } as Record<string, string>)[key] };

function setup(payment: { id: string; merchantId: string } | null) {
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ last: 42 }]),
    paymentIntent: { findUnique: jest.fn().mockResolvedValue(payment) },
    complaint: { create: jest.fn(async ({ data }) => ({ id: "cmg1abcdefghijklmnopqrstu", ...data })) },
    complaintEvent: { create: jest.fn(async ({ data }) => ({ id: `ev_${data.type}`, ...data })) },
    complaintAttachment: { create: jest.fn() },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async (cb: any) => cb(tx)) };
  const files = { put: jest.fn().mockResolvedValue("3f2504e0-4f89-11d3-9a0c-0305e82c3301"), get: jest.fn() };
  const mailer = { send: jest.fn().mockResolvedValue(true), trackingUrl: (id: string) => `https://checkout.pagosya.bo/reclamos/s/${createComplaintToken(id, "s")}` };
  return { tx, prisma, files, mailer, service: new ComplaintIntakeService(prisma, files as any, mailer as any, config as any) };
}

describe("ComplaintIntakeService.create", () => {
  it("numbers the complaint, sets the 5-business-day deadline, links the payment and emails the buyer", async () => {
    const { tx, mailer, service } = setup({ id: "pi_abc123", merchantId: "m_1" });
    const result = await service.create(dto, [], NOW);
    expect(result.number).toBe("R-2026-000042");
    expect(result.dueAt.toISOString()).toBe("2026-10-16T03:59:59.999Z");
    expect(result.trackingUrl).toMatch(/^https:\/\/checkout\.pagosya\.bo\/reclamos\/s\//);
    expect(tx.complaint.create).toHaveBeenCalledWith({ data: expect.objectContaining({ paymentIntentId: "pi_abc123", merchantId: "m_1", referenceGiven: "pi_abc123" }) });
    expect(tx.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.LINKED, actor: ComplaintActor.SYSTEM }) });
    expect(mailer.send).toHaveBeenCalledWith("RECEIVED", "cmg1abcdefghijklmnopqrstu");
  });

  it("answers an unknown reference exactly like a known one", async () => {
    const known = await setup({ id: "pi_abc123", merchantId: "m_1" }).service.create(dto, [], NOW);
    const { tx, service } = setup(null);
    const unknown = await service.create({ ...dto, reference: "pi_doesnotexist" }, [], NOW);
    expect(Object.keys(unknown).sort()).toEqual(Object.keys(known).sort());
    expect(tx.complaint.create).toHaveBeenCalledWith({ data: expect.objectContaining({ paymentIntentId: null, merchantId: null }) });
  });

  it("never looks up a reference that isn't shaped like a payment id", async () => {
    const { tx, service } = setup(null);
    await service.create({ ...dto, reference: "' OR 1=1 --" }, [], NOW);
    expect(tx.paymentIntent.findUnique).not.toHaveBeenCalled();
  });

  it("also looks up an older payment whose id is a plain cuid", async () => {
    const { tx, service } = setup({ id: "cmg1abcdefghijklmnopqrstu", merchantId: "m_1" });
    await service.create({ ...dto, reference: "cmg1abcdefghijklmnopqrstu" }, [], NOW);
    expect(tx.paymentIntent.findUnique).toHaveBeenCalledWith({ where: { id: "cmg1abcdefghijklmnopqrstu" }, select: { id: true, merchantId: true } });
  });

  it("requires a reference or a store name", async () => {
    const { service } = setup(null);
    await expect(service.create({ ...dto, reference: " ", storeName: undefined }, [], NOW)).rejects.toThrow("Escribe la referencia de tu pago o el nombre de la tienda.");
  });

  it("stores nothing for a bot that filled the honeypot, yet answers in the same shape", async () => {
    const { prisma, files, mailer, service } = setup(null);
    const result = await service.create({ ...dto, website: "http://spam" }, [], NOW);
    expect(result.number).toMatch(/^R-2026-\d{6}$/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(files.put).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("stores checked files privately and attaches them to the RECEIVED event", async () => {
    const { tx, files, service } = setup(null);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    await service.create(dto, [{ originalname: "caja rota.jpg", mimetype: "image/jpeg", size: 4, buffer: jpg }], NOW);
    expect(files.put).toHaveBeenCalledWith(jpg, "image/jpeg");
    expect(tx.complaintAttachment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ eventId: "ev_RECEIVED", uploadedBy: ComplaintActor.BUYER, fileName: "caja rota.jpg", contentType: "image/jpeg" }) });
  });
});

describe("ComplaintIntakeService.track", () => {
  const stored = {
    id: "cmg1abcdefghijklmnopqrstu", number: "R-2026-000042", status: ComplaintStatus.WAITING_MERCHANT, category: "NOT_DELIVERED", request: "REFUND",
    receivedAt: NOW, dueAt: new Date("2026-10-16T03:59:59.999Z"), extendedAt: null, extensionReason: null, answeredAt: null, outcome: null, answer: null, emailConfirmedAt: null,
    events: [
      { id: "e1", type: ComplaintEventType.RECEIVED, actor: ComplaintActor.BUYER, body: "Nunca llegó.", createdAt: NOW, attachments: [] },
      { id: "e2", type: ComplaintEventType.NOTE, actor: ComplaintActor.OPS, body: "interno", createdAt: NOW, attachments: [] },
      { id: "e3", type: ComplaintEventType.MERCHANT_REPLIED, actor: ComplaintActor.MERCHANT, body: "del comercio", createdAt: NOW, attachments: [] },
    ],
  };

  it("shows the buyer only their own messages, reports WAITING_MERCHANT as IN_REVIEW and confirms the email once", async () => {
    const { prisma, tx, service } = setup(null);
    prisma.complaint.findUnique = jest.fn().mockResolvedValue(stored);
    tx.complaint.update = jest.fn().mockResolvedValue({});
    const view = await service.track(createComplaintToken(stored.id, "s"), NOW);
    expect(view.status).toBe("IN_REVIEW");
    expect(view.messages.map((m) => m.body)).toEqual(["Nunca llegó."]);
    expect(JSON.stringify(view)).not.toContain("interno");
    expect(JSON.stringify(view)).not.toContain("del comercio");
    expect(tx.complaint.update).toHaveBeenCalledWith({ where: { id: stored.id }, data: { emailConfirmedAt: NOW } });
  });

  it("is a 404 for a bad token", async () => {
    const { service } = setup(null);
    await expect(service.track("bad.token")).rejects.toThrow("Reclamo no encontrado");
  });

  it("refuses a buyer message that lands after the answer, even when it passed the first check", async () => {
    const { prisma, tx, service } = setup(null);
    prisma.complaint.findUnique = jest.fn().mockResolvedValueOnce(stored).mockResolvedValueOnce({ status: ComplaintStatus.ANSWERED });
    await expect(service.addMessage(createComplaintToken(stored.id, "s"), "una cosa más", [])).rejects.toThrow("Este reclamo ya fue respondido.");
    expect(tx.complaintEvent.create).not.toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.BUYER_MESSAGE }) });
  });

  it("refuses a buyer message after the answer", async () => {
    const { prisma, service } = setup(null);
    prisma.complaint.findUnique = jest.fn().mockResolvedValue({ ...stored, status: ComplaintStatus.ANSWERED });
    await expect(service.addMessage(createComplaintToken(stored.id, "s"), "una cosa más", [])).rejects.toThrow("Este reclamo ya fue respondido.");
  });
});
