import { ConflictException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { BusinessDocumentsService } from "./business-documents.service";
import { readDocumentLinkToken } from "./document-link-token";
import { snapshotSha256 } from "./business-document-snapshot";

/**
 * A small in-memory stand-in for the Prisma calls the service makes, with the
 * schema's unique constraints, so versioning, numbering and once-only events
 * are tested as behaviour rather than as call shapes.
 */
type Row = Record<string, any>;
const unique = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
let seq = 0;
const id = (prefix: string) => `c${prefix}${String(++seq).padStart(22, "0")}`;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return condition.in.includes(row[key]);
      if ("notIn" in condition) return !condition.notIn.includes(row[key]);
    }
    return (row[key] ?? null) === (condition ?? null);
  });
}

class FakePrisma {
  stores: Row[] = [];
  customers: Row[] = [];
  paymentLinks: Row[] = [];
  documents: Row[] = [];
  items: Row[] = [];
  versions: Row[] = [];
  events: Row[] = [];

  private withIncludes(doc: Row, include: Row = {}) {
    const result: Row = { ...doc };
    if (include.items) result.items = this.items.filter((item) => item.documentId === doc.id).sort((a, b) => a.position - b.position);
    if (include.versions) result.versions = this.versions.filter((v) => v.documentId === doc.id).sort((a, b) => a.version - b.version);
    if (include.events) result.events = this.events.filter((e) => e.documentId === doc.id);
    return result;
  }

  private saveDocument(doc: Row) {
    if (doc.number != null && this.documents.some((other) => other.id !== doc.id && other.storeId === doc.storeId && other.kind === doc.kind && other.number === doc.number)) throw unique();
  }

  store = {
    findFirst: async ({ where }: Row) => this.stores.find((store) => matches(store, where)) ?? null,
    findUnique: async ({ where }: Row) => this.stores.find((store) => store.id === where.id) ?? null,
  };
  businessCustomer = { findFirst: async ({ where }: Row) => this.customers.find((row) => matches(row, where)) ?? null };
  paymentLink = { count: async ({ where }: Row) => this.paymentLinks.filter((row) => matches(row, where)).length };
  businessDocument = {
    create: async ({ data }: Row) => {
      const { items, events, ...fields } = data;
      const doc = { id: id("doc"), number: null, status: "DRAFT", currency: "BOB", currentVersion: 0, sentAt: null, viewedAt: null, voidedAt: null, createdAt: new Date(), updatedAt: new Date(), content: [], ...fields };
      this.documents.push(doc);
      (items?.create ?? []).forEach((item: Row) => this.items.push({ id: id("item"), documentId: doc.id, paymentLinkId: null, ...item }));
      (events?.create ?? []).forEach((event: Row) => this.events.push({ id: id("evt"), documentId: doc.id, at: new Date(), dedupeKey: null, ...event }));
      return { ...doc };
    },
    findFirst: async ({ where, include }: Row) => {
      const doc = this.documents.find((row) => matches(row, where));
      return doc ? this.withIncludes(doc, include) : null;
    },
    findUnique: async ({ where, include }: Row) => {
      const doc = this.documents.find((row) => row.id === where.id);
      return doc ? this.withIncludes(doc, include) : null;
    },
    findMany: async ({ where, include }: Row) => this.documents.filter((row) => matches(row, where)).map((doc) => this.withIncludes(doc, include)),
    update: async ({ where, data }: Row) => {
      const doc = this.documents.find((row) => row.id === where.id)!;
      const next = { ...doc, ...data, updatedAt: new Date() };
      this.saveDocument(next);
      Object.assign(doc, next);
      return { ...doc };
    },
    updateMany: async ({ where, data }: Row) => {
      const rows = this.documents.filter((row) => matches(row, where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    },
    delete: async ({ where }: Row) => {
      this.documents = this.documents.filter((row) => row.id !== where.id);
      this.items = this.items.filter((row) => row.documentId !== where.id);
      this.events = this.events.filter((row) => row.documentId !== where.id);
    },
    aggregate: async ({ where }: Row) => ({ _max: { number: Math.max(0, ...this.documents.filter((row) => matches(row, where)).map((row) => row.number ?? 0)) || null } }),
  };
  businessDocumentItem = {
    deleteMany: async ({ where }: Row) => { this.items = this.items.filter((row) => row.documentId !== where.documentId); },
    createMany: async ({ data }: Row) => { data.forEach((item: Row) => this.items.push({ id: id("item"), paymentLinkId: null, ...item })); },
  };
  businessDocumentVersion = {
    findUnique: async ({ where }: Row) => this.versions.find((v) => v.documentId === where.documentId_version.documentId && v.version === where.documentId_version.version) ?? null,
    create: async ({ data }: Row) => {
      if (this.versions.some((v) => v.documentId === data.documentId && v.version === data.version)) throw unique();
      const version = { id: id("ver"), createdAt: new Date(), ...data };
      this.versions.push(version);
      return version;
    },
  };
  businessDocumentEvent = {
    create: async ({ data }: Row) => {
      if (data.dedupeKey && this.events.some((e) => e.documentId === data.documentId && e.dedupeKey === data.dedupeKey)) throw unique();
      const event = { id: id("evt"), at: new Date(), dedupeKey: null, ipAddress: null, userAgent: null, ...data };
      this.events.push(event);
      return event;
    },
  };
  $transaction = async (fn: (tx: this) => Promise<unknown>) => fn(this);
}

const SECRET = "test-document-link-secret-with-at-least-32-chars";

function setup() {
  const prisma = new FakePrisma();
  prisma.stores.push(
    { id: "store_1", merchantId: "m_1", name: "Estudio Illimani", logoUrl: "/v1/uploads/logo.png", contactEmail: "hola@illimani.bo" },
    { id: "store_2", merchantId: "m_2", name: "Otra tienda", logoUrl: null, contactEmail: null },
  );
  prisma.customers.push({ id: "cust_1", storeId: "store_1", name: "Ana Quispe", email: "ana@example.com", phone: "+591 7000000", document: "4567890" });
  prisma.customers.push({ id: "cust_2", storeId: "store_2", name: "Ajeno", email: "x@example.com", phone: null, document: null });
  prisma.paymentLinks.push({ id: "pl_1", storeId: "store_1" }, { id: "pl_2", storeId: "store_2" });
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  const values: Record<string, string> = { "app.documentLinkSecret": SECRET, "app.checkoutOrigin": "https://pay.example/" };
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

  it("does not email when there is no customer email", async () => {
    const { service, email } = setup();
    const created = await service.create("m_1", "store_1", { ...invoice, customerEmail: undefined });
    const result = await service.send("m_1", "store_1", created.id, {});
    expect(result.emailed).toBe(false);
    expect(email.send).not.toHaveBeenCalled();
  });
});
