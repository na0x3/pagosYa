import { applyMembershipJoin, applyMembershipRenewalPaid } from "./membership-enrollment";
import { membershipKey } from "./membership-rules";

const now = new Date("2027-01-31T15:00:00Z");
const order = { id: "order_1", storeId: "store_1", merchantId: "m1" };
const metadata = (extra: object = {}) => ({ storeId: "store_1", cart: [{ paymentLinkId: "club", name: "Club del café · Mensual", quantity: 1, unitAmount: 5000 }],
  membership: { productId: "club", periodId: "m1", storeCustomerId: "cust_1", consentText: "Cada período…", consentAt: now.toISOString() }, ...extra });
function makeTx() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ id: "cust_1" }]),
    storeCustomer: { findUnique: jest.fn().mockResolvedValue({ id: "cust_1", storeId: "store_1", name: "Ana", email: "ana@mail.com", phone: null, deletedAt: null }) },
    store: { findUnique: jest.fn().mockResolvedValue({ id: "store_1", slug: "cafe", name: "Café Norte", membershipGraceDays: 7 }) },
    paymentLink: { findFirst: jest.fn().mockResolvedValue({ id: "club", name: "Club del café" }) },
    // archived and repriced since the buyer started: enrollment still honours the price paid
    membershipPeriod: { findUnique: jest.fn().mockResolvedValue({ id: "m1", paymentLinkId: "club", months: 1, amount: 5500, archivedAt: new Date("2027-01-20") }) },
    customerSubscription: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}), findUnique: jest.fn() },
    storeOrder: { findUnique: jest.fn().mockResolvedValue({ items: [{ name: "Club del café · Mensual", quantity: 1, unitAmount: 5000 }] }), update: jest.fn() },
    subscriptionInvoice: { findFirst: jest.fn() },
  };
}

describe("applyMembershipJoin", () => {
  it("creates the membership at the price paid, with access to the end of February", async () => {
    const tx = makeTx();
    const result = await applyMembershipJoin(tx as never, { intent: { id: "pi_1", currency: "BOB", metadata: metadata() }, order, checkoutOrigin: "https://pagar.test", now });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.customerSubscription.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      merchantId: "m1", storeId: "store_1", paymentLinkId: "club", storeCustomerId: "cust_1", membershipPeriodId: "m1",
      status: "ACTIVE", activeKey: membershipKey("store_1", "club", "cust_1"), unitAmount: 5000, quantity: 1,
      accessUntil: new Date("2027-02-28T15:00:00Z"), nextBillingAt: new Date("2027-02-28T15:00:00Z"),
      customerEmail: "ana@mail.com", sourceOrderId: "order_1", consentText: "Cada período…",
    }) });
    expect(result.emailBlock).toContain("Membresía: Club del café · Mensual");
    expect(result.emailBlock).toContain("https://pagar.test/cuenta/cafe/membresias");
    expect(result.emailBlock).toContain("no se cobra nada automáticamente");
  });

  it("reactivates the same row for a lapsed member", async () => {
    const tx = makeTx();
    tx.customerSubscription.findFirst.mockResolvedValue({ id: "sub_old", status: "LAPSED", accessUntil: new Date("2026-11-01T00:00:00Z") });
    await applyMembershipJoin(tx as never, { intent: { id: "pi_1", currency: "BOB", metadata: metadata() }, order, checkoutOrigin: "https://pagar.test", now });
    expect(tx.customerSubscription.update).toHaveBeenCalledWith({ where: { id: "sub_old" }, data: expect.objectContaining({ status: "ACTIVE", canceledAt: null, missedCount: 0, accessUntil: new Date("2027-02-28T15:00:00Z") }) });
    expect(tx.customerSubscription.create).not.toHaveBeenCalled();
  });

  it("records a second payment by a current member as a duplicate instead of a second membership", async () => {
    const tx = makeTx();
    tx.customerSubscription.findFirst.mockResolvedValue({ id: "sub_1", status: "ACTIVE", accessUntil: new Date("2027-02-15T00:00:00Z") });
    const result = await applyMembershipJoin(tx as never, { intent: { id: "pi_2", currency: "BOB", metadata: metadata() }, order, checkoutOrigin: "https://pagar.test", now });
    expect(result.duplicate).toBe(true);
    expect(tx.customerSubscription.create).not.toHaveBeenCalled();
    expect(tx.storeOrder.update).toHaveBeenCalledWith({ where: { id: "order_1" }, data: { items: [expect.objectContaining({ name: "Club del café · Mensual · pago duplicado (ya era miembro)" })] } });
    expect(result.emailBlock).toContain("Ya eras miembro");
  });

  it("does nothing for an intent without membership metadata, or a deleted account", async () => {
    const tx = makeTx();
    await expect(applyMembershipJoin(tx as never, { intent: { id: "pi", currency: "BOB", metadata: { cart: [] } }, order, checkoutOrigin: "x" })).resolves.toEqual({ emailBlock: "", duplicate: false });
    tx.storeCustomer.findUnique.mockResolvedValue({ id: "cust_1", storeId: "store_1", deletedAt: new Date() });
    await expect(applyMembershipJoin(tx as never, { intent: { id: "pi", currency: "BOB", metadata: metadata() }, order, checkoutOrigin: "x" })).resolves.toEqual({ emailBlock: "", duplicate: false });
    expect(tx.customerSubscription.create).not.toHaveBeenCalled();
  });
});

describe("applyMembershipRenewalPaid", () => {
  it("extends access by one period from the renewal's period start", async () => {
    const tx = makeTx();
    tx.subscriptionInvoice.findFirst.mockResolvedValue({ subscriptionId: "sub_1", periodStart: new Date("2027-02-28T15:00:00Z") });
    tx.customerSubscription.findUnique.mockResolvedValue({ id: "sub_1", membershipPeriodId: "m1", accessUntil: new Date("2027-02-28T15:00:00Z") });
    await applyMembershipRenewalPaid(tx as never, "pi_r1");
    expect(tx.customerSubscription.update).toHaveBeenCalledWith({ where: { id: "sub_1" }, data: { accessUntil: new Date("2027-03-28T15:00:00Z"), missedCount: 0 } });
  });
  it("ignores product subscriptions", async () => {
    const tx = makeTx();
    tx.subscriptionInvoice.findFirst.mockResolvedValue({ subscriptionId: "sub_p", periodStart: now });
    tx.customerSubscription.findUnique.mockResolvedValue({ id: "sub_p", membershipPeriodId: null, accessUntil: null });
    await applyMembershipRenewalPaid(tx as never, "pi_r1");
    expect(tx.customerSubscription.update).not.toHaveBeenCalled();
  });
});
