import { MockSinInvoicingAdapter } from "./mock-sin-invoicing.adapter";

describe("MockSinInvoicingAdapter", () => {
  const adapter = new MockSinInvoicingAdapter();

  it("issues a CUIS scoped to nit/sucursal/puntoVenta", async () => {
    const result = await adapter.ensureCuis({ nit: "123", razonSocial: "Tienda", sucursal: 0, puntoVenta: 0 });
    expect(result.cuis).toMatch(/^CUIS-123-0-0-MOCK-/);
  });

  it("issues a CUFD that expires ~24h from now", async () => {
    const before = Date.now();
    const result = await adapter.requestCufd({ cuis: "CUIS-1" });
    expect(result.cufd).toMatch(/^CUFD-CUIS-1-MOCK-/);
    expect(result.expiresAt.getTime() - before).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  it("emits an invoice with a CUF for a normal request", async () => {
    const result = await adapter.emitInvoice({
      nit: "123",
      cuis: "CUIS-1",
      cufd: "CUFD-1",
      sucursal: 0,
      puntoVenta: 0,
      amount: 5000,
      currency: "BOB",
      customerName: "Juan Perez",
      customerDocument: "1234567",
      idempotencyKey: "invoice_pi_1",
    });
    expect(result.status).toBe("emitted");
    expect(result.cuf).toMatch(/^CUF-123-CUFD-1-MOCK-/);
  });

  it("simulates SIN being unreachable for the documented test document", async () => {
    const result = await adapter.emitInvoice({
      nit: "123",
      cuis: "CUIS-1",
      cufd: "CUFD-1",
      sucursal: 0,
      puntoVenta: 0,
      amount: 5000,
      currency: "BOB",
      customerName: "x",
      customerDocument: "0000000_sin_down",
      idempotencyKey: "invoice_pi_2",
    });
    expect(result.status).toBe("failed");
    expect(result.failureReason).toBe("sin_service_unavailable");
  });
});
