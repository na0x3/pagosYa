import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DlocalPayment, DlocalPaymentMethod, DlocalTransport } from "./dlocal.types";

const fixture = <T>(name: string): T => JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8")) as T;

/**
 * Offline stand-in for dLocal until sandbox keys exist (DLOCAL_ENABLED=false).
 * Deterministic by input: card token "tok_dlocal_decline" is rejected,
 * a DIRECT card is paid, and everything else is a pending redirect back to
 * the callback URL so the return page and dev "simulate" button can be exercised.
 */
export class DlocalFixtureTransport implements DlocalTransport {
  private readonly payments = new Map<string, DlocalPayment>();

  async request<T>(method: "GET" | "POST", requestPath: string, body?: unknown): Promise<T> {
    if (method === "GET" && requestPath.startsWith("/payments-methods")) return fixture<DlocalPaymentMethod[]>("payment-methods-br.json") as T;
    if (method === "POST" && requestPath === "/payments") return this.createPayment(body as Record<string, any>) as T;
    if (method === "GET" && requestPath.startsWith("/payments/")) {
      const id = decodeURIComponent(requestPath.slice("/payments/".length));
      return (this.payments.get(id) ?? { ...fixture<DlocalPayment>("payment-pending-redirect.json"), id }) as T;
    }
    if (method === "POST" && requestPath === "/refunds") return { id: `R-fixture-${this.payments.size}`, status: "SUCCESS" } as T;
    throw new Error(`DlocalFixtureTransport has no fixture for ${method} ${requestPath}`);
  }

  private createPayment(body: Record<string, any>): DlocalPayment {
    const common = { amount: body.amount, currency: body.currency, country: body.country, payment_method_id: body.payment_method_id, order_id: body.order_id };
    const id = `D-fixture-${body.order_id}-${this.payments.size + 1}`;
    const payment: DlocalPayment =
      body.card?.token === "tok_dlocal_decline"
        ? { ...fixture<DlocalPayment>("payment-rejected.json"), ...common, id }
        : body.payment_method_flow === "DIRECT"
          ? { ...fixture<DlocalPayment>("payment-paid.json"), ...common, id }
          : { ...fixture<DlocalPayment>("payment-pending-redirect.json"), ...common, id, redirect_url: body.callback_url };
    this.payments.set(id, payment);
    return payment;
  }
}
