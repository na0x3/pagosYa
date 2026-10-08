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

function build(storeEmail?: unknown, order: object | null = null) {
  const prisma = { storeOrder: { findUnique: jest.fn().mockResolvedValue(order) } };
  const email = { send: jest.fn() };
  // With an order the tracking link needs a checkout origin; the tracking secret falls back to the development one.
  const config = noopConfig();
  const pricing = config.get();
  config.get.mockImplementation((key: string) => (key === "app.checkoutOrigin" ? "https://pagar.bo" : key === "app.orderTrackingSecret" ? undefined : pricing));
  const service = new PaymentIntentsService(
    prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, email as any,
    config, inertLimits() as any, { notify: jest.fn() } as any, { recordCapture: jest.fn() } as any, undefined, storeEmail as any,
  );
  return { service, email };
}

const order = (over: object = {}) => ({ id: "ord_1", storeId: "s1", fulfillmentMethod: null, fulfillmentLocationName: null, recipientName: null,
  shippingStreet: null, shippingCity: null, shippingDepartment: null, shippingReferences: null, ...over });

describe("PaymentIntentsService HTML confirmation", () => {
  it("passes the order's delivery to the email, and leaves the text body untouched", async () => {
    const renderReceipt = jest.fn().mockResolvedValue({ html: "<html></html>", subject: "Asunto", repairs: [] });
    const delivered = order({ fulfillmentMethod: "delivery", recipientName: "Ana", shippingStreet: "Av. 1", shippingCity: "La Paz", shippingDepartment: null });
    const withHtml = build({ renderReceipt }, delivered);
    await (withHtml.service as any).sendReceiptEmail(intent, "Tienda Ejemplo");
    expect(renderReceipt.mock.calls[0][1].delivery).toEqual({ method: "delivery", recipient: "Ana", lines: ["Av. 1", "La Paz"] });

    const without = build(undefined, delivered);
    await (without.service as any).sendReceiptEmail(intent, "Tienda Ejemplo");
    expect(withHtml.email.send.mock.calls[0][0].body).toBe(without.email.send.mock.calls[0][0].body);
  });

  it("a pickup order names the location, and an order without a method has no delivery", async () => {
    const renderReceipt = jest.fn().mockResolvedValue({ html: "<html></html>", subject: "Asunto", repairs: [] });
    await (build({ renderReceipt }, order({ fulfillmentMethod: "pickup", fulfillmentLocationName: "Sucursal Centro" })).service as any).sendReceiptEmail(intent, "Tienda Ejemplo");
    expect(renderReceipt.mock.calls[0][1].delivery).toEqual({ method: "pickup", location: "Sucursal Centro" });
    await (build({ renderReceipt }, order()).service as any).sendReceiptEmail(intent, "Tienda Ejemplo");
    expect(renderReceipt.mock.calls[1][1].delivery).toBeNull();
  });

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
