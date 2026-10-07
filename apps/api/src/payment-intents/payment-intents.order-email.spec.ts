import { PaymentIntentsService } from "./payment-intents.service";

// Mirrors the local helpers in payment-intents.service.spec.ts; they are not exported.
const noopConfig = () => ({ get: jest.fn().mockReturnValue({ bobPerUsd: 0, intlFeeBps: 590, costBps: 0 }) }) as any;
const inertLimits = () => ({ assertPerPayment: jest.fn(), reserve: jest.fn().mockResolvedValue({ crossedWarning: false }), settle: jest.fn(), release: jest.fn() });

const intent = {
  id: "pi_html_1",
  amount: 5000,
  currency: "BOB",
  customerEmail: "ana@example.com",
  customerName: "Ana",
  metadata: { cart: [{ paymentLinkId: "link_1", variantId: "v_1", name: "Zapatos", quantity: 1, unitAmount: 5000 }] },
};

function build(storeEmail?: unknown) {
  const prisma = { storeOrder: { findUnique: jest.fn().mockResolvedValue(null) } };
  const email = { send: jest.fn() };
  const service = new PaymentIntentsService(
    prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, email as any,
    noopConfig(), inertLimits() as any, { notify: jest.fn() } as any, undefined, storeEmail as any,
  );
  return { service, email };
}

describe("PaymentIntentsService HTML confirmation", () => {
  it("sends the rendered HTML alongside the text body", async () => {
    const renderReceipt = jest.fn().mockResolvedValue({ html: "<html><body>Orden: pi_html_1</body></html>", subject: "Gracias por tu compra en Tienda Ejemplo", repairs: [] });
    const { service, email } = build({ renderReceipt });
    await (service as any).sendReceiptEmail(intent, "Tienda Ejemplo");

    const sent = email.send.mock.calls[0][0];
    expect(sent.html).toContain("pi_html_1");
    // The store's wording names the subject; the product and variant travel so the email can show their photos.
    expect(sent.subject).toBe("Gracias por tu compra en Tienda Ejemplo");
    expect(renderReceipt.mock.calls[0][1].lines[0]).toMatchObject({ paymentLinkId: "link_1", variantId: "v_1", name: "Zapatos", quantity: 1 });
  });

  it("leaves the text body byte-identical to the one sent without HTML", async () => {
    const withHtml = build({ renderReceipt: jest.fn().mockResolvedValue({ html: "<html></html>", subject: "Asunto", repairs: [] }) });
    await (withHtml.service as any).sendReceiptEmail(intent, "Tienda Ejemplo");

    const without = build(undefined);
    await (without.service as any).sendReceiptEmail(intent, "Tienda Ejemplo");

    expect(withHtml.email.send.mock.calls[0][0].body).toBe(without.email.send.mock.calls[0][0].body);
  });

  it("still sends the text receipt when rendering the HTML throws", async () => {
    const { service, email } = build({ renderReceipt: jest.fn().mockRejectedValue(new Error("boom")) });
    await (service as any).sendReceiptEmail(intent, "Tienda Ejemplo");

    const sent = email.send.mock.calls[0][0];
    expect(sent.body).toContain("Orden: pi_html_1");
    expect(sent.html).toBeUndefined();
    expect(sent.subject).toBe("Recibo de tu compra en Tienda Ejemplo");
  });

  it("sends the text receipt unchanged when no renderer is wired at all", async () => {
    const { service, email } = build(undefined);
    await (service as any).sendReceiptEmail(intent, "Tienda Ejemplo");
    expect(email.send.mock.calls[0][0].html).toBeUndefined();
    expect(email.send.mock.calls[0][0].body).toContain("Orden: pi_html_1");
  });
});
