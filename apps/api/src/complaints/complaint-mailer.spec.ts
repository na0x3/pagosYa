import { ComplaintActor, ComplaintEventType } from "@prisma/client";
import { ComplaintMailer } from "./complaint-mailer";

const complaint = { id: "cmg1abcdefghijklmnopqrstu", number: "R-2026-000123", buyerName: "Ana", buyerEmail: "ana@example.com", dueAt: new Date("2026-10-16T03:59:59.999Z"), extensionReason: null, outcome: null, answer: null, merchantId: null, merchantDueAt: null };
const config = { get: (key: string) => ({ "app.checkoutOrigin": "https://checkout.pagosya.bo", "app.merchantDashboardOrigin": "https://comercios.pagosya.bo", "app.orderTrackingSecret": "s" } as Record<string, string>)[key] };

function setup(send: jest.Mock) {
  const prisma: any = {
    complaint: { findUnique: jest.fn().mockResolvedValue(complaint) },
    complaintEvent: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(null) },
    merchantUser: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, mailer: new ComplaintMailer(prisma, { send } as any, config as any) };
}

describe("ComplaintMailer", () => {
  it("sends loudly and records EMAIL_SENT", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const { prisma, mailer } = setup(send);
    await expect(mailer.send("RECEIVED", complaint.id)).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@example.com", failLoudly: true, idempotencyKey: expect.stringMatching(new RegExp(`^complaint-${complaint.id}-RECEIVED-0-[0-9a-f]{12}$`)) }));
    expect(send.mock.calls[0][0].body).toContain("https://checkout.pagosya.bo/reclamos/s/");
    expect(prisma.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.EMAIL_SENT, actor: ComplaintActor.SYSTEM, meta: { kind: "RECEIVED", to: "ana@example.com" } }) });
  });

  it("records EMAIL_FAILED and never throws when delivery fails", async () => {
    const { prisma, mailer } = setup(jest.fn().mockRejectedValue(new Error("Resend down")));
    jest.spyOn((mailer as any).logger, "warn").mockImplementation(() => undefined);
    await expect(mailer.send("RECEIVED", complaint.id)).resolves.toBe(false);
    expect(prisma.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.EMAIL_FAILED, body: "Resend down" }) });
  });

  describe("merchant emails", () => {
    const asked = { ...complaint, merchantId: "m_1", merchantDueAt: new Date("2026-10-13T03:59:59.999Z") };
    function merchantSetup(send: jest.Mock, users: string[]) {
      const { prisma, mailer } = setup(send);
      prisma.complaint.findUnique.mockResolvedValue(asked);
      prisma.complaintEvent.findFirst.mockResolvedValue({ id: "ev_ask", body: "¿Enviaste el pedido?" });
      prisma.merchantUser.findMany.mockResolvedValue(users.map((email) => ({ email })));
      jest.spyOn((mailer as any).logger, "warn").mockImplementation(() => undefined);
      return { prisma, mailer };
    }
    const types = (prisma: any) => prisma.complaintEvent.create.mock.calls.map((call: any[]) => [call[0].data.type, call[0].data.meta?.to]);

    it("gives each merchant user their own key for this question, and one failure doesn't stop the rest", async () => {
      const send = jest.fn().mockRejectedValueOnce(new Error("rejected")).mockResolvedValueOnce(undefined);
      const { prisma, mailer } = merchantSetup(send, ["a@tienda.bo", "b@tienda.bo"]);
      await expect(mailer.send("MERCHANT_ASKED", complaint.id)).resolves.toBe(false);
      const keys = send.mock.calls.map((call) => call[0].idempotencyKey);
      expect(keys).toHaveLength(2);
      expect(new Set(keys).size).toBe(2);
      expect(keys.every((key: string) => key.includes("-MERCHANT_ASKED-ev_ask-"))).toBe(true);
      expect(types(prisma)).toEqual([[ComplaintEventType.EMAIL_FAILED, "a@tienda.bo"], [ComplaintEventType.EMAIL_SENT, "b@tienda.bo"]]);
    });

    it("records a failure when the merchant has nobody verified to email", async () => {
      const { prisma, mailer } = merchantSetup(jest.fn(), []);
      await expect(mailer.send("MERCHANT_ASKED", complaint.id)).resolves.toBe(false);
      expect(prisma.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.EMAIL_FAILED, body: "Sin destinatarios verificados" }) });
    });

    it("retries only the recipient that failed", async () => {
      const send = jest.fn().mockResolvedValue(undefined);
      const { mailer } = merchantSetup(send, ["a@tienda.bo", "b@tienda.bo"]);
      await mailer.send("MERCHANT_ASKED", complaint.id, "a@tienda.bo");
      expect(send.mock.calls.map((call) => call[0].to)).toEqual(["a@tienda.bo"]);
    });
  });
});
