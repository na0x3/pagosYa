import { PaymentMethodType } from "@prisma/client";
import { RailRegistry } from "./rail-registry.service";
import { MockCardRailAdapter } from "./adapters/mock-card.adapter";
import { MockTigoMoneyAdapter } from "./adapters/mock-tigo-money.adapter";
import { UnknownRailError, UnsupportedPaymentMethodError } from "./rail-registry.errors";

describe("RailRegistry", () => {
  const card = new MockCardRailAdapter();
  const tigo = new MockTigoMoneyAdapter();
  const registry = new RailRegistry([card, tigo]);

  it("resolves an adapter by supported payment method type", () => {
    expect(registry.getForMethodType(PaymentMethodType.CARD)).toBe(card);
    expect(registry.getForMethodType(PaymentMethodType.TIGO_MONEY)).toBe(tigo);
  });

  it("throws UnsupportedPaymentMethodError when no adapter supports the type", () => {
    expect(() => registry.getForMethodType(PaymentMethodType.QR)).toThrow(UnsupportedPaymentMethodError);
  });

  it("resolves an adapter by railId", () => {
    expect(registry.get("mock_card")).toBe(card);
  });

  it("throws UnknownRailError for an unregistered railId", () => {
    expect(() => registry.get("mock_qr")).toThrow(UnknownRailError);
  });
});

describe("MockCardRailAdapter", () => {
  const adapter = new MockCardRailAdapter();
  const baseReq = {
    paymentIntentId: "pi_1",
    amount: 1000,
    currency: "BOB",
    idempotencyKey: "idem_1",
  };

  it("succeeds for tok_visa_success", async () => {
    const result = await adapter.authorize({
      ...baseReq,
      paymentMethod: { type: PaymentMethodType.CARD, token: "tok_visa_success" },
    });
    expect(result.status).toBe("succeeded");
    expect(result.railReference).toMatch(/^card_auth_/);
  });

  it("fails for tok_visa_decline", async () => {
    const result = await adapter.authorize({
      ...baseReq,
      paymentMethod: { type: PaymentMethodType.CARD, token: "tok_visa_decline" },
    });
    expect(result.status).toBe("failed");
    expect(result.failureReason).toBe("card_declined");
  });
});

describe("MockTigoMoneyAdapter", () => {
  const adapter = new MockTigoMoneyAdapter();
  const baseReq = {
    paymentIntentId: "pi_1",
    amount: 1000,
    currency: "BOB",
    idempotencyKey: "idem_1",
  };

  it("returns requires_action by default (USSD confirmation)", async () => {
    const result = await adapter.authorize({
      ...baseReq,
      paymentMethod: { type: PaymentMethodType.TIGO_MONEY, token: "tok_tigo_anything" },
    });
    expect(result.status).toBe("requires_action");
    expect(result.actionRequired?.type).toBe("ussd_prompt");
  });

  it("succeeds synchronously for tok_tigo_instant_success", async () => {
    const result = await adapter.authorize({
      ...baseReq,
      paymentMethod: { type: PaymentMethodType.TIGO_MONEY, token: "tok_tigo_instant_success" },
    });
    expect(result.status).toBe("succeeded");
  });
});
