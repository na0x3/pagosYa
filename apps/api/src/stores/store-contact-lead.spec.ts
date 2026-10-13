import { StoreStatus } from "@prisma/client";
import { StoreCheckoutService } from "./store-checkout.service";

/**
 * Spec 2026-10-13, A2: a showcase's contact form must reach the merchant's panel as a lead. Today's path already does
 * (kit commerce.js renderContact → POST /stores/public/:slug/leads with items: [] → StoreLead + inbox thread, listed by
 * GET /stores/:id/inbox), so no new lead model is added; this pins that path.
 */
describe("a contact message from the storefront form", () => {
  it("is saved as a lead with no cart, opens its inbox thread and emails the store", async () => {
    const prisma: any = {
      store: { findUnique: jest.fn().mockResolvedValue({ id: "store_1", merchantId: "m_1", slug: "deff", name: "deff", status: StoreStatus.ACTIVE, sourcePublicationPaused: false, publicVisibility: true, contactFormEnabled: true, contactFormEmail: null, contactEmail: "hola@deff.bo", checkoutMode: "payment", locations: [] }) },
      merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "m_1", email: "owner@deff.bo" }) },
      paymentLink: { findMany: jest.fn().mockResolvedValue([]) },
      storeLead: { create: jest.fn().mockResolvedValue({ id: "lead_1" }) },
    };
    const email = { send: jest.fn().mockResolvedValue(undefined) };
    const inbox = { threadForLead: jest.fn().mockResolvedValue(undefined) };
    const service = new StoreCheckoutService(prisma, { create: jest.fn() } as any, email as any, undefined, undefined, inbox as any);
    await expect(service.submitLead("deff", { items: [], name: "Lucía", email: "lucia@gmail.com", message: "Quiero cotizar una casa." })).resolves.toEqual({ submitted: true, leadId: "lead_1" });
    expect(prisma.storeLead.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ storeId: "store_1", customerName: "Lucía", customerEmail: "lucia@gmail.com", message: "Quiero cotizar una casa.", items: [], amount: 0 }) }));
    expect(inbox.threadForLead).toHaveBeenCalledWith(expect.objectContaining({ id: "lead_1", storeId: "store_1", message: "Quiero cotizar una casa." }));
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: "hola@deff.bo", subject: "Nuevo mensaje para deff: Lucía" }));
  });
});
