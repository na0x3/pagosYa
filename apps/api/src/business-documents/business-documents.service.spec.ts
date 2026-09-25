import { ConflictException, HttpException, HttpStatus, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { BusinessDocumentsService } from "./business-documents.service";
import { readDocumentLinkToken } from "./document-link-token";
import { snapshotSha256 } from "./business-document-snapshot";

import { FakePrisma } from "./testing/fake-document-prisma";

const SECRET = "test-document-link-secret-with-at-least-32-chars";

function setup(config: Record<string, unknown> = {}) {
  const prisma = new FakePrisma();
  prisma.stores.push(
    { id: "store_1", merchantId: "m_1", name: "Estudio Illimani", logoUrl: "/v1/uploads/logo.png", contactEmail: "hola@illimani.bo", contactPhone: "+591 70000001" },
    { id: "store_2", merchantId: "m_2", name: "Otra tienda", logoUrl: null, contactEmail: null },
  );
  prisma.customers.push({ id: "cust_1", storeId: "store_1", name: "Ana Quispe", email: "ana@example.com", phone: "+591 7000000", document: "4567890" });
  prisma.customers.push({ id: "cust_2", storeId: "store_2", name: "Ajeno", email: "x@example.com", phone: null, document: null });
  prisma.paymentLinks.push({ id: "pl_1", storeId: "store_1" }, { id: "pl_2", storeId: "store_2" });
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  const values: Record<string, unknown> = { "app.documentLinkSecret": SECRET, "app.checkoutOrigin": "https://pay.example/", ...config };
  const service = new BusinessDocumentsService(prisma as any, { get: (key: string) => values[key] } as any, email as any);
  return { prisma, email, service };
}

const invoice = {
  kind: "INVOICE" as const,
  title: "Diseño de logo",
  customerName: "Ana Quispe",
  customerEmail: "ana@example.com",
  discountAmount: 250,
  items: [{ description: "Boceto", quantity: 2, unitAmount: 1500 }, { description: "Revisión", quantity: 1, unitAmount: 250 }],
  content: [{ type: "paragraph" as const, text: "Gracias." }],
};

describe("BusinessDocumentsService — drafts", () => {
  it("never touches another merchant's store", async () => {
    const { service, prisma } = setup();
    await expect(service.create("m_2", "store_1", invoice)).rejects.toThrow(NotFoundException);
    expect(prisma.documents).toHaveLength(0);
  });

  it("creates a numberless draft with computed totals and a created event", async () => {
    const { service, prisma } = setup();
    const doc = await service.create("m_1", "store_1", invoice);
    expect(doc).toEqual(expect.objectContaining({
      kind: "INVOICE", status: "DRAFT", number: null, numberLabel: "Borrador",
      subtotalAmount: 3250, discountAmount: 250, totalAmount: 3000, publicUrl: null, currentVersion: 0,
    }));
    expect(doc.items.map((item: any) => item.amount)).toEqual([3000, 250]);
    expect(prisma.documents[0]).toEqual(expect.objectContaining({ storeId: "store_1", merchantId: "m_1" }));
    expect(prisma.events.map((event) => event.type)).toEqual(["created"]);
  });

  it("fills the customer from a store CRM row, and refuses another store's customer or product", async () => {
    const { service } = setup();
    const doc = await service.create("m_1", "store_1", { kind: "PROPOSAL", title: "Propuesta", businessCustomerId: "cust_1", customerPhone: "+591 7111111" });
    expect(doc.customer).toEqual({ name: "Ana Quispe", email: "ana@example.com", phone: "+591 7111111", document: "4567890" });
    expect(doc.businessCustomerId).toBe("cust_1");
    await expect(service.create("m_1", "store_1", { kind: "PROPOSAL", title: "x", businessCustomerId: "cust_2" })).rejects.toThrow(NotFoundException);
    await expect(service.create("m_1", "store_1", { ...invoice, items: [{ description: "x", quantity: 1, unitAmount: 1, paymentLinkId: "pl_2" }] })).rejects.toThrow(NotFoundException);
  });

  it("replaces the items and recomputes the totals on update", async () => {
    const { service } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    const updated = await service.update("m_1", "store_1", created.id, { items: [{ description: "Único", quantity: 3, unitAmount: 1000, paymentLinkId: "pl_1" }], discountAmount: 0 });
    expect(updated.items).toEqual([expect.objectContaining({ description: "Único", amount: 3000, paymentLinkId: "pl_1" })]);
    expect(updated).toEqual(expect.objectContaining({ subtotalAmount: 3000, totalAmount: 3000 }));
  });

  it("keeps the existing discount valid against new items", async () => {
    const { service } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    await expect(service.update("m_1", "store_1", created.id, { items: [{ description: "Barato", quantity: 1, unitAmount: 100 }] })).rejects.toThrow("descuento");
  });

  it("refuses edits once a document is final", async () => {
    const { service, prisma } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    prisma.documents[0].status = "PAID";
    await expect(service.update("m_1", "store_1", created.id, { title: "Nuevo" })).rejects.toThrow(ConflictException);
  });

  it("refuses an edit when the document is voided between its first read and the transaction", async () => {
    const { service, prisma } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    const original = prisma.$transaction;
    prisma.$transaction = async (fn) => {
      prisma.documents[0].status = "VOIDED";
      return original(fn);
    };
    await expect(service.update("m_1", "store_1", created.id, { title: "Nuevo", items: [{ description: "Otro", quantity: 1, unitAmount: 500 }], discountAmount: 0 }))
      .rejects.toThrow(ConflictException);
    expect(prisma.documents[0]).toEqual(expect.objectContaining({ status: "VOIDED", title: "Diseño de logo", totalAmount: 3000 }));
    expect(prisma.items.map((item) => item.description)).toEqual(["Boceto", "Revisión"]);
  });

  it("deletes only a document that was never sent", async () => {
    const { service, prisma } = setup();
    const draft = await service.create("m_1", "store_1", invoice);
    const sent = await service.create("m_1", "store_1", invoice);
    await service.send("m_1", "store_1", sent.id, { email: false });
    await expect(service.remove("m_1", "store_1", sent.id)).rejects.toThrow(ConflictException);
    await service.remove("m_1", "store_1", draft.id);
    expect(prisma.documents.map((doc) => doc.id)).toEqual([sent.id]);
  });

  it("lists only the store's documents, filtered by kind", async () => {
    const { service } = setup();
    await service.create("m_1", "store_1", invoice);
    await service.create("m_1", "store_1", { kind: "CONTRACT", title: "Contrato" });
    const list = await service.list("m_1", "store_1", { kind: "CONTRACT" });
    expect(list.map((doc: any) => doc.title)).toEqual(["Contrato"]);
    await expect(service.list("m_1", "store_2", {})).rejects.toThrow(NotFoundException);
  });
});

describe("BusinessDocumentsService — send", () => {
  it("numbers the document, freezes version 1 with its sha and links to it", async () => {
    const { service, prisma } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    const result = await service.send("m_1", "store_1", created.id, { email: false });

    expect(result.document).toEqual(expect.objectContaining({ status: "SENT", number: 1, numberLabel: "COB-0001", currentVersion: 1 }));
    expect(prisma.versions).toHaveLength(1);
    const version = prisma.versions[0];
    expect(version).toEqual(expect.objectContaining({ version: 1, sentAt: expect.any(Date) }));
    expect(version.sha256).toBe(snapshotSha256(version.content));
    expect(version.content).toEqual(expect.objectContaining({ numberLabel: "COB-0001", totalAmount: 3000 }));
    expect(JSON.stringify(version.content)).not.toMatch(/store_1|m_1/);
    expect(prisma.events.filter((event) => event.type === "sent")).toEqual([expect.objectContaining({ version: 1, data: { sha256: version.sha256 } })]);
    expect(result.publicUrl).toMatch(/^https:\/\/pay\.example\/d\/[^/]+$/);
    expect(readDocumentLinkToken(result.publicUrl.split("/d/")[1], SECRET)).toBe(created.id);
    expect(result.emailed).toBe(false);
  });

  it("numbers per store and kind", async () => {
    const { service } = setup();
    const a = await service.create("m_1", "store_1", invoice);
    const b = await service.create("m_1", "store_1", invoice);
    const c = await service.create("m_1", "store_1", { kind: "PROPOSAL", title: "Propuesta" });
    await service.send("m_1", "store_1", a.id, { email: false });
    await service.send("m_1", "store_1", c.id, { email: false });
    const sentB = await service.send("m_1", "store_1", b.id, { email: false });
    expect(sentB.document.numberLabel).toBe("COB-0002");
    expect((await service.get("m_1", "store_1", c.id)).numberLabel).toBe("PRO-0001");
  });

  it("creates no new version for a re-send without edits, and version 2 after an edit", async () => {
    const { service, prisma } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    await service.send("m_1", "store_1", created.id, { email: false });
    await service.send("m_1", "store_1", created.id, { email: false });
    expect(prisma.versions).toHaveLength(1);
    expect(prisma.events.filter((event) => event.type === "sent").map((event) => event.data)).toEqual([expect.objectContaining({ sha256: expect.any(String) }), { resend: true }]);

    await service.update("m_1", "store_1", created.id, { title: "Diseño de logo y tarjetas" });
    const second = await service.send("m_1", "store_1", created.id, { email: false });
    expect(prisma.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(prisma.versions[1].sha256).not.toBe(prisma.versions[0].sha256);
    expect(second.document).toEqual(expect.objectContaining({ number: 1, currentVersion: 2 }));
  });

  it("refuses to send a document with unfilled placeholders", async () => {
    const { service, prisma } = setup();
    const created = await service.create("m_1", "store_1", { kind: "CONTRACT", title: "Contrato con {{cliente}}", content: [{ type: "clause", title: "Inicio", text: "Desde {{fecha}}" }] });
    await expect(service.send("m_1", "store_1", created.id, {})).rejects.toThrow(UnprocessableEntityException);
    await expect(service.send("m_1", "store_1", created.id, {})).rejects.toThrow("{{cliente}}, {{fecha}}");
    expect(prisma.versions).toHaveLength(0);
    expect(prisma.documents[0].number).toBeNull();
  });

  it("refuses to send when the customer fields or the message still hold a placeholder", async () => {
    const { service, prisma, email } = setup();
    const customerless = await service.create("m_1", "store_1", { ...invoice, customerName: "{{cliente}}" });
    await expect(service.send("m_1", "store_1", customerless.id, { email: false })).rejects.toThrow("{{cliente}}");
    const created = await service.create("m_1", "store_1", invoice);
    await expect(service.send("m_1", "store_1", created.id, { message: "Nos vemos el {{fecha}}" })).rejects.toThrow("{{fecha}}");
    expect(prisma.versions).toHaveLength(0);
    expect(email.send).not.toHaveBeenCalled();
  });

  it("refuses to send a cobro with nothing to charge", async () => {
    const { service } = setup();
    const created = await service.create("m_1", "store_1", { kind: "INVOICE", title: "Vacío" });
    await expect(service.send("m_1", "store_1", created.id, {})).rejects.toThrow(UnprocessableEntityException);
  });

  it("retries when another send took the same number", async () => {
    const { service, prisma } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    prisma.documents.push({ id: "other", storeId: "store_1", kind: "INVOICE", number: 1, status: "SENT", currentVersion: 1 });
    const aggregate = jest.spyOn(prisma.businessDocument, "aggregate").mockResolvedValueOnce({ _max: { number: null } });
    const result = await service.send("m_1", "store_1", created.id, { email: false });
    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(result.document.numberLabel).toBe("COB-0002");
    expect(prisma.versions).toHaveLength(1);
  });

  it("emails the customer an HTML message with the PDF attached, replying to the store", async () => {
    const { service, email, prisma } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    const result = await service.send("m_1", "store_1", created.id, { message: "Gracias por confiar en nosotros." });
    expect(result.emailed).toBe(true);
    const request = email.send.mock.calls[0][0];
    expect(request).toEqual(expect.objectContaining({
      to: "ana@example.com",
      replyTo: "hola@illimani.bo",
      subject: "Cobro COB-0001 de Estudio Illimani",
      failLoudly: true,
      idempotencyKey: expect.stringMatching(/^business-document\//),
    }));
    expect(request.body).toContain(result.publicUrl);
    expect(request.html).toContain(result.publicUrl);
    expect(request.html).toContain("Gracias por confiar en nosotros.");
    expect(request.attachments).toEqual([expect.objectContaining({ filename: "COB-0001.pdf", contentType: "application/pdf" })]);
    expect(Buffer.from(request.attachments[0].content, "base64").subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(prisma.events.map((event) => event.type)).toEqual(["created", "sent", "emailed"]);
  });

  it("gives each delivery of the same version its own idempotency key", async () => {
    const { service, email } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    await service.send("m_1", "store_1", created.id, {});
    await service.send("m_1", "store_1", created.id, {});
    expect(email.send.mock.calls[0][0].idempotencyKey).not.toBe(email.send.mock.calls[1][0].idempotencyKey);
  });

  it("escapes merchant-typed text in the HTML email", async () => {
    const { service, email } = setup();
    const created = await service.create("m_1", "store_1", { ...invoice, title: "<script>alert(1)</script>", customerName: "<b>Ana</b>" });
    await service.send("m_1", "store_1", created.id, { message: "<img src=x onerror=alert(1)>" });
    const html: string = email.send.mock.calls[0][0].html;
    expect(html).not.toMatch(/<script|<img|<b>/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps the send when delivery fails and says so", async () => {
    const { service, email, prisma } = setup();
    email.send.mockRejectedValue(new Error("Email delivery failed: domain not verified"));
    const created = await service.create("m_1", "store_1", invoice);
    const result = await service.send("m_1", "store_1", created.id, {});
    expect(result.emailed).toBe(false);
    expect(result.document.status).toBe("SENT");
    expect(prisma.events.find((event) => event.type === "email_failed")).toEqual(expect.objectContaining({ data: expect.objectContaining({ to: "ana@example.com" }) }));
  });

  /** Runs `change` after the service's first read and before its transaction, like a concurrent request would. */
  function raceBeforeTransaction(prisma: FakePrisma, change: () => void) {
    const original = prisma.$transaction;
    prisma.$transaction = async (fn) => {
      change();
      return original(fn);
    };
  }

  it("never sends over a document voided between its first read and the transaction", async () => {
    const { service, prisma, email } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    raceBeforeTransaction(prisma, () => Object.assign(prisma.documents[0], { status: "VOIDED", voidedAt: new Date() }));
    await expect(service.send("m_1", "store_1", created.id, {})).rejects.toThrow(ConflictException);
    expect(prisma.documents[0].status).toBe("VOIDED");
    expect(prisma.versions).toHaveLength(0);
    expect(email.send).not.toHaveBeenCalled();
  });

  it("never re-sends a sent document that was paid between its first read and the transaction", async () => {
    const { service, prisma, email } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    await service.send("m_1", "store_1", created.id, { email: false });
    raceBeforeTransaction(prisma, () => { prisma.documents[0].status = "PAID"; });
    await expect(service.send("m_1", "store_1", created.id, {})).rejects.toThrow(ConflictException);
    expect(prisma.documents[0].status).toBe("PAID");
    expect(prisma.events.filter((event) => event.type === "sent")).toHaveLength(1);
    expect(email.send).not.toHaveBeenCalled();
  });

  it("validates the row the transaction reads: placeholders, totals and recipient", async () => {
    const { service, prisma, email } = setup();
    const withPlaceholder = await service.create("m_1", "store_1", invoice);
    raceBeforeTransaction(prisma, () => { prisma.documents[0].title = "Cobro a {{cliente}}"; });
    await expect(service.send("m_1", "store_1", withPlaceholder.id, {})).rejects.toThrow("{{cliente}}");
    expect(prisma.versions).toHaveLength(0);

    const { service: service2, prisma: prisma2, email: email2 } = setup();
    const emptied = await service2.create("m_1", "store_1", invoice);
    raceBeforeTransaction(prisma2, () => Object.assign(prisma2.documents[0], { subtotalAmount: 0, discountAmount: 0, totalAmount: 0 }));
    await expect(service2.send("m_1", "store_1", emptied.id, {})).rejects.toThrow(UnprocessableEntityException);
    expect(prisma2.versions).toHaveLength(0);

    const { service: service3, prisma: prisma3, email: email3 } = setup();
    const readdressed = await service3.create("m_1", "store_1", invoice);
    raceBeforeTransaction(prisma3, () => { prisma3.documents[0].customerEmail = "nuevo@example.com"; });
    await service3.send("m_1", "store_1", readdressed.id, {});
    expect(email3.send.mock.calls[0][0].to).toBe("nuevo@example.com");
    expect(prisma3.versions[0].content.customer.email).toBe("nuevo@example.com");
    expect(email.send).not.toHaveBeenCalled();
    expect(email2.send).not.toHaveBeenCalled();
  });

  it("caps document emails per store per day, counting the last 24 hours of emailed events", async () => {
    const { service, prisma, email } = setup({ "app.documentEmailsPerDay": 2 });
    const first = await service.create("m_1", "store_1", invoice);
    await service.send("m_1", "store_1", first.id, {});
    // An old delivery and another store's delivery do not count.
    prisma.events.push({ id: "old", documentId: first.id, type: "emailed", at: new Date(Date.now() - 25 * 3600_000) });
    prisma.documents.push({ id: "foreign", storeId: "store_2", kind: "INVOICE", status: "SENT", currentVersion: 1 });
    prisma.events.push({ id: "foreign_evt", documentId: "foreign", type: "emailed", at: new Date() });
    const second = await service.create("m_1", "store_1", invoice);
    await service.send("m_1", "store_1", second.id, {});
    expect(email.send).toHaveBeenCalledTimes(2);

    const third = await service.create("m_1", "store_1", invoice);
    const refused = await service.send("m_1", "store_1", third.id, {}).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(HttpException);
    expect((refused as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((refused as HttpException).message).toMatch(/límite de 2 correos/);
    expect((refused as HttpException).message).toMatch(/WhatsApp/);
    expect(email.send).toHaveBeenCalledTimes(2);
    expect(prisma.documents.find((doc) => doc.id === third.id)).toEqual(expect.objectContaining({ status: "DRAFT", number: null }));

    // The link, WhatsApp and copy channels do not email, so they are not capped.
    const linkOnly = await service.send("m_1", "store_1", third.id, { email: false });
    expect(linkOnly.document.status).toBe("SENT");
    expect(linkOnly.publicUrl).toMatch(/\/d\//);
  });

  it("defaults the document email cap to 200 a day", async () => {
    const { service, prisma, email } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    for (let n = 0; n < 199; n += 1) prisma.events.push({ id: `e${n}`, documentId: created.id, type: "emailed", at: new Date() });
    await service.send("m_1", "store_1", created.id, {});
    expect(email.send).toHaveBeenCalledTimes(1);
    await expect(service.send("m_1", "store_1", created.id, {})).rejects.toThrow("límite de 200 correos");
  });

  it("does not email when there is no customer email", async () => {
    const { service, email } = setup();
    const created = await service.create("m_1", "store_1", { ...invoice, customerEmail: undefined });
    const result = await service.send("m_1", "store_1", created.id, {});
    expect(result.emailed).toBe(false);
    expect(email.send).not.toHaveBeenCalled();
  });
});

describe("BusinessDocumentsService — void", () => {
  it("voids a sent document with the reason in the timeline", async () => {
    const { service, prisma } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    await service.send("m_1", "store_1", created.id, { email: false });
    const voided = await service.void("m_1", "store_1", created.id, { reason: "Duplicado" });
    expect(voided).toEqual(expect.objectContaining({ status: "VOIDED", voidedAt: expect.any(Date) }));
    expect(prisma.events.at(-1)).toEqual(expect.objectContaining({ type: "voided", version: 1, data: { reason: "Duplicado" } }));
  });

  it("refuses to void a paid, signed or already voided document", async () => {
    const { service, prisma } = setup();
    const created = await service.create("m_1", "store_1", invoice);
    for (const status of ["PAID", "SIGNED", "VOIDED"]) {
      prisma.documents[0].status = status;
      await expect(service.void("m_1", "store_1", created.id, {})).rejects.toThrow(ConflictException);
    }
    await expect(service.void("m_2", "store_1", created.id, {})).rejects.toThrow(NotFoundException);
  });
});

describe("BusinessDocumentsService — public link", () => {
  const context = { ipAddress: "190.0.0.1", userAgent: "Mozilla/5.0" };
  async function sent(service: BusinessDocumentsService) {
    const created = await service.create("m_1", "store_1", invoice);
    const result = await service.send("m_1", "store_1", created.id, { email: false });
    return { id: created.id, token: result.publicUrl.split("/d/")[1] };
  }

  it("404s a bad token, another secret's token and a document never sent", async () => {
    const { service } = setup();
    const draft = await service.create("m_1", "store_1", invoice);
    const draftToken = service.publicUrl(draft.id).split("/d/")[1];
    await expect(service.publicView("nope", context)).rejects.toThrow(NotFoundException);
    await expect(service.publicView(`${draftToken}x`, context)).rejects.toThrow(NotFoundException);
    await expect(service.publicView(draftToken, context)).rejects.toThrow(NotFoundException);
  });

  it("shows the frozen version only, with no internal ids", async () => {
    const { service, prisma } = setup();
    const { id, token } = await sent(service);
    // An unsent edit must not leak through the public link.
    await service.update("m_1", "store_1", id, { title: "Borrador interno" });
    const view = await service.publicView(token, context);
    expect(view).toEqual({
      kind: "INVOICE",
      numberLabel: "COB-0001",
      status: "VIEWED",
      version: 1,
      sha256: prisma.versions[0].sha256,
      sentAt: expect.any(Date),
      updatedAfterFirstSend: false,
      // The store's public contact, as on its storefront and order tracking page.
      store: { name: "Estudio Illimani", logoUrl: "/v1/uploads/logo.png", contactEmail: "hola@illimani.bo", contactPhone: "+591 70000001" },
      document: prisma.versions[0].content,
      dueAt: null,
      paidAt: null,
      payable: true,
      preview: false,
    });
    expect(view.document?.title).toBe("Diseño de logo");
    const serialized = JSON.stringify(view);
    for (const internal of ["store_1", "m_1", id, "pl_", "cust_"]) expect(serialized).not.toContain(internal);
  });

  it("records viewed once per version, with the viewer's IP and user agent", async () => {
    const { service, prisma } = setup();
    const { id, token } = await sent(service);
    await service.publicView(token, context);
    await service.publicView(token, { ipAddress: "10.0.0.2", userAgent: "Other" });
    const viewed = () => prisma.events.filter((event) => event.type === "viewed");
    expect(viewed()).toEqual([expect.objectContaining({ version: 1, ipAddress: "190.0.0.1", userAgent: "Mozilla/5.0", dedupeKey: "viewed:v1" })]);
    expect(prisma.documents[0].viewedAt).toEqual(expect.any(Date));

    await service.update("m_1", "store_1", id, { title: "Diseño de logo y tarjetas" });
    await service.send("m_1", "store_1", id, { email: false });
    expect(prisma.documents[0].status).toBe("SENT");
    const second = await service.publicView(token, context);
    expect(second).toEqual(expect.objectContaining({ version: 2, status: "VIEWED", updatedAfterFirstSend: true }));
    expect(viewed().map((event) => event.version)).toEqual([1, 2]);
  });

  it("treats a concurrent duplicate view as already recorded", async () => {
    const { service, prisma } = setup();
    const { token } = await sent(service);
    jest.spyOn(prisma.businessDocumentEvent, "create").mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    await expect(service.publicView(token, context)).resolves.toEqual(expect.objectContaining({ version: 1 }));
  });

  it("never moves a paid or voided document back to viewed", async () => {
    const { service, prisma } = setup();
    const { token } = await sent(service);
    prisma.documents[0].status = "PAID";
    expect((await service.publicView(token, context)).status).toBe("PAID");
    expect(prisma.documents[0].status).toBe("PAID");
  });

  it("revokes a voided document's content: the link keeps only store, number, title, status and void date", async () => {
    const { service, prisma } = setup();
    const { id, token } = await sent(service);
    await service.void("m_1", "store_1", id, { reason: "Duplicado" });
    const view = await service.publicView(token, context);
    expect(view).toEqual({
      kind: "INVOICE",
      numberLabel: "COB-0001",
      title: "Diseño de logo",
      status: "VOIDED",
      voidedAt: prisma.documents[0].voidedAt,
      store: { name: "Estudio Illimani", logoUrl: "/v1/uploads/logo.png" },
    });
    const serialized = JSON.stringify(view);
    for (const revoked of ["Ana Quispe", "ana@example.com", "Boceto", "Revisión", "Gracias.", "Duplicado"]) expect(serialized).not.toContain(revoked);
    expect(prisma.events.some((event) => event.type === "viewed")).toBe(false);
  });

  it("serves a voided document's PDF stamped ANULADO, without the customer, items or blocks", async () => {
    const { service } = setup();
    const { id, token } = await sent(service);
    await service.void("m_1", "store_1", id, {});
    const pdf = await service.publicPdf(token);
    const raw = pdf.buffer.toString("latin1");
    expect(raw.startsWith("%PDF-")).toBe(true);
    const { inflateSync } = await import("node:zlib");
    const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map((match) => {
      try { return inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"); } catch { return ""; }
    }).join("");
    const drawn = (streams.match(/<[0-9a-fA-F]+>/g) ?? []).map((hex) => Buffer.from(hex.slice(1, -1), "hex").toString("latin1")).join("");
    expect(drawn).toContain("ANULADO");
    for (const revoked of ["Ana Quispe", "ana@example.com", "Boceto", "Gracias."]) expect(drawn).not.toContain(revoked);
  });

  it("serves the frozen version as a PDF without recording a view", async () => {
    const { service, prisma } = setup();
    const { token } = await sent(service);
    const pdf = await service.publicPdf(token);
    expect(pdf.filename).toBe("COB-0001.pdf");
    expect(pdf.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(prisma.events.some((event) => event.type === "viewed")).toBe(false);
  });
});

describe("BusinessDocumentsService — cobros (D1)", () => {
  const context = { ipAddress: "190.0.0.1", userAgent: "Mozilla/5.0" };
  async function sent(service: BusinessDocumentsService, extra: Record<string, unknown> = {}) {
    const created = await service.create("m_1", "store_1", { ...invoice, ...extra });
    const result = await service.send("m_1", "store_1", created.id, { email: false });
    return { id: created.id, token: result.publicUrl.split("/d/")[1] };
  }

  it("gives the merchant a preview link that records no view", async () => {
    const { service, prisma } = setup();
    const { id, token } = await sent(service);
    const detail = await service.get("m_1", "store_1", id);
    expect(detail.previewUrl).toMatch(new RegExp(`^https://pay\\.example/d/${token.replace(/[.]/g, "\\.")}\\?preview=`));
    const preview = new URL(detail.previewUrl!).searchParams.get("preview")!;
    const view = await service.publicView(token, context, preview);
    expect(view).toEqual(expect.objectContaining({ preview: true, status: "SENT" }));
    expect(prisma.events.some((event) => event.type === "viewed")).toBe(false);
    expect(prisma.documents[0].status).toBe("SENT");
  });

  it("ignores a preview token for another document, and records the view", async () => {
    const { service, prisma } = setup();
    const first = await sent(service);
    const second = await sent(service);
    const foreignPreview = new URL((await service.get("m_1", "store_1", second.id)).previewUrl!).searchParams.get("preview")!;
    const view = await service.publicView(first.token, context, foreignPreview);
    expect(view).toEqual(expect.objectContaining({ preview: false, status: "VIEWED" }));
    expect(prisma.events.filter((event) => event.type === "viewed")).toHaveLength(1);
  });

  it("has no preview for a draft", async () => {
    const { service } = setup();
    const draft = await service.create("m_1", "store_1", invoice);
    expect((await service.get("m_1", "store_1", draft.id)).previewUrl).toBeNull();
  });

  it("tells the customer's page the due date, the payment date and whether it can still be paid", async () => {
    const { service, prisma } = setup();
    const dueAt = "2026-10-02T03:59:59.000Z";
    const { token } = await sent(service, { dueAt });
    expect(await service.publicView(token, context)).toEqual(expect.objectContaining({ dueAt: new Date(dueAt), paidAt: null, payable: true }));
    prisma.documents[0].status = "OVERDUE";
    expect((await service.publicView(token, context)).payable).toBe(true);
    const paidAt = new Date("2026-10-01T15:00:00Z");
    Object.assign(prisma.documents[0], { status: "PAID", paidAt });
    expect(await service.publicView(token, context)).toEqual(expect.objectContaining({ status: "PAID", paidAt, payable: false }));
  });

  it("never offers payment for a proposal", async () => {
    const { service } = setup();
    const created = await service.create("m_1", "store_1", { kind: "PROPOSAL", title: "Propuesta", items: invoice.items });
    const { publicUrl } = await service.send("m_1", "store_1", created.id, { email: false });
    expect((await service.publicView(publicUrl.split("/d/")[1], context)).payable).toBe(false);
  });

  it("shows the merchant the payment fields and the reminders flag", async () => {
    const { service } = setup();
    const doc = await service.create("m_1", "store_1", { ...invoice, autoReminders: false });
    expect(doc).toEqual(expect.objectContaining({ paidAt: null, paymentIntentId: null, autoReminders: false }));
    const updated = await service.update("m_1", "store_1", doc.id, { autoReminders: true });
    expect(updated.autoReminders).toBe(true);
  });

  it("counts reminder emails against the store's daily email cap", async () => {
    const { service, prisma, email } = setup({ "app.documentEmailsPerDay": 2 });
    const { id } = await sent(service);
    prisma.events.push({ id: "r1", documentId: id, type: "reminded", at: new Date(), data: { channel: "email" } });
    prisma.events.push({ id: "r2", documentId: id, type: "reminded", at: new Date(), data: { channel: "whatsapp" } });
    const second = await service.create("m_1", "store_1", invoice);
    await service.send("m_1", "store_1", second.id, {});
    expect(email.send).toHaveBeenCalledTimes(1);
    const third = await service.create("m_1", "store_1", invoice);
    const refused = await service.send("m_1", "store_1", third.id, {}).catch((error: unknown) => error);
    expect((refused as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it("cancels a checkout the customer has not started when the cobro is voided", async () => {
    const { service, prisma } = setup();
    const { id } = await sent(service);
    prisma.documents[0].paymentIntentId = "pi_open";
    prisma.paymentIntents.push({ id: "pi_open", status: "REQUIRES_PAYMENT_METHOD" }, { id: "pi_other", status: "REQUIRES_PAYMENT_METHOD" });
    await service.void("m_1", "store_1", id, {});
    expect(prisma.paymentIntents).toEqual([{ id: "pi_open", status: "CANCELED" }, { id: "pi_other", status: "REQUIRES_PAYMENT_METHOD" }]);
  });

  it("never waits for a checkout another transaction holds when voiding (no deadlock with a capture)", async () => {
    const { service, prisma } = setup();
    const { id } = await sent(service);
    prisma.documents[0].paymentIntentId = "pi_busy";
    prisma.paymentIntents.push({ id: "pi_busy", status: "REQUIRES_PAYMENT_METHOD" });
    prisma.lockedIntents.add("pi_busy");
    await service.void("m_1", "store_1", id, {});
    expect(prisma.documents[0].status).toBe("VOIDED");
    expect(prisma.paymentIntents[0].status).toBe("REQUIRES_PAYMENT_METHOD");
    expect(prisma.rawQueries.some((sql) => /"PaymentIntent".*FOR UPDATE SKIP LOCKED/s.test(sql))).toBe(true);
  });

  it("reads the store logo from its own uploads for the PDF, never from a remote URL", async () => {
    const { prisma } = setup();
    const uploads = { getBuffer: jest.fn().mockResolvedValue(Buffer.from("png")) };
    const service = new BusinessDocumentsService(prisma as any, { get: () => undefined } as any, { send: jest.fn() } as any, uploads as any);
    await expect(service.storeLogo("/v1/uploads/abc.png")).resolves.toEqual(Buffer.from("png"));
    expect(uploads.getBuffer).toHaveBeenCalledWith("abc.png");
    await expect(service.storeLogo("https://evil.example/logo.png")).resolves.toBeNull();
    await expect(service.storeLogo(null)).resolves.toBeNull();
    uploads.getBuffer.mockRejectedValueOnce(new Error("S3 down"));
    await expect(service.storeLogo("/v1/uploads/abc.png")).resolves.toBeNull();
    expect(uploads.getBuffer).toHaveBeenCalledTimes(2);
  });

  it("leaves a checkout already in progress alone when voiding", async () => {
    const { service, prisma } = setup();
    const { id } = await sent(service);
    prisma.documents[0].paymentIntentId = "pi_qr";
    prisma.paymentIntents.push({ id: "pi_qr", status: "REQUIRES_ACTION" });
    await service.void("m_1", "store_1", id, {});
    expect(prisma.paymentIntents[0].status).toBe("REQUIRES_ACTION");
  });
});
