import { ComplaintOutcome } from "@prisma/client";
import { buyerEmail, laPazDateLabel, merchantAskedEmail, opsDigestEmail } from "./complaint-emails";

const facts = { number: "R-2026-000123", buyerName: "Ana", dueAt: new Date("2026-10-16T03:59:59.999Z"), trackingUrl: "https://checkout.pagosya.bo/reclamos/s/tok" };
const DUE_LABEL = laPazDateLabel(facts.dueAt);

describe("complaint emails", () => {
  it("dates in La Paz, in Spanish", () => {
    expect(DUE_LABEL).toContain("15 de octubre de 2026");
    expect(DUE_LABEL.toLowerCase()).toContain("jueves");
  });

  it("confirms receipt with the number, the deadline and the tracking link", () => {
    const { subject, body } = buyerEmail("RECEIVED", facts);
    expect(subject).toBe("Recibimos tu reclamo R-2026-000123");
    expect(body).toContain(DUE_LABEL);
    expect(body).toContain(facts.trackingUrl);
  });

  it("explains an extension with its reason", () => {
    expect(buyerEmail("EXTENDED", { ...facts, extensionReason: "Esperamos al banco." }).body).toContain("Esperamos al banco.");
  });

  it("ends every answer with the ASFI second-instance notice", () => {
    const { subject, body } = buyerEmail("ANSWERED", { ...facts, outcome: ComplaintOutcome.UPHELD, answer: "Te devolvimos el dinero." });
    expect(subject).toBe("Respuesta a tu reclamo R-2026-000123");
    expect(body).toContain("Te devolvimos el dinero.");
    expect(body).toContain("Resultado: a tu favor");
    expect(body.trim().endsWith("www.asfi.gob.bo.")).toBe(true);
  });

  it("asks the merchant with the question and the reply-by date", () => {
    const merchantDueAt = new Date("2026-10-13T03:59:59.999Z");
    const { body } = merchantAskedEmail({ number: "R-2026-000123", question: "¿Enviaste el pedido?", merchantDueAt, dashboardUrl: "https://comercios.pagosya.bo/#dashboard-complaints" });
    expect(body).toContain("¿Enviaste el pedido?");
    expect(body).toContain(laPazDateLabel(merchantDueAt));
  });

  it("lists overdue complaints first in the ops digest", () => {
    const { body } = opsDigestEmail([
      { number: "R-2026-000002", dueAt: new Date("2026-10-16T03:59:59.999Z"), overdue: false, merchantName: "Tienda" },
      { number: "R-2026-000001", dueAt: new Date("2026-10-08T03:59:59.999Z"), overdue: true, merchantName: null },
    ]);
    expect(body.indexOf("R-2026-000001")).toBeLessThan(body.indexOf("R-2026-000002"));
    expect(body).toContain("VENCIDO");
  });
});
