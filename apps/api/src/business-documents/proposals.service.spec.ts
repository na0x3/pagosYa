import { ConflictException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { BusinessDocumentsService } from "./business-documents.service";
import { ProposalsService } from "./proposals.service";
import type { ProposalDraftOutput } from "./proposal-draft";
import { FakePrisma } from "./testing/fake-document-prisma";

const SECRET = "test-document-link-secret-with-at-least-32-chars";

function aiOutput(overrides: Partial<ProposalDraftOutput> = {}): ProposalDraftOutput {
  return {
    title: "Identidad visual para Café Aroma",
    intro: "Gracias por pensar en nosotros.",
    problem: "La cafetería abre en noviembre y necesita una marca.",
    scope: ["Investigación", "Diseño del logo"],
    deliverables: ["Logo en PNG y SVG"],
    timeline: [{ when: "Semana 1", milestone: "Bocetos" }],
    investmentNote: "Incluye dos rondas de cambios.",
    paymentTerms: "50% al aceptar y 50% al entregar.",
    revisions: "Dos rondas de revisiones.",
    nextStep: "Acepta la propuesta en línea.",
    items: [
      { description: "Diseño de logo", quantity: 1, source: "catalog", catalogId: "pl_logo", merchantAmount: 10 },
      { description: "Fotografía", quantity: 1, source: "unknown", catalogId: null, merchantAmount: null },
    ],
    ...overrides,
  };
}

export function setupProposals(config: Record<string, unknown> = {}) {
  const prisma = new FakePrisma();
  prisma.stores.push(
    { id: "store_1", merchantId: "m_1", name: "Estudio Illimani", status: "ACTIVE", tagline: "Diseño en La Paz", aboutText: "Hacemos marcas.", logoUrl: null, contactEmail: "hola@illimani.bo", contactPhone: "+591 70000001" },
    { id: "store_2", merchantId: "m_2", name: "Otra tienda", status: "ACTIVE", tagline: null, aboutText: null, logoUrl: null, contactEmail: null, contactPhone: null },
  );
  prisma.merchants.push({ id: "m_1", status: "ACTIVE", email: "duena@illimani.bo" }, { id: "m_2", status: "ACTIVE", email: "otro@example.com" });
  prisma.categories.push({ id: "cat_1", storeId: "store_1", name: "Branding" });
  prisma.paymentLinks.push(
    { id: "pl_logo", storeId: "store_1", name: "Diseño de logo", amount: 150000, currency: "BOB", status: "ACTIVE", categoryId: "cat_1" },
    { id: "pl_old", storeId: "store_1", name: "Viejo", amount: 1000, currency: "BOB", status: "ARCHIVED", categoryId: null },
    { id: "pl_other", storeId: "store_2", name: "Ajeno", amount: 5000, currency: "BOB", status: "ACTIVE", categoryId: null },
  );
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  const values: Record<string, unknown> = { "app.documentLinkSecret": SECRET, "app.checkoutOrigin": "https://pay.example/", "app.merchantDashboardOrigin": "https://panel.example", ...config };
  const settings = { get: (key: string) => values[key] };
  const documents = new BusinessDocumentsService(prisma as any, settings as any, email as any);
  const ai = { structuredCompletion: jest.fn().mockResolvedValue({ data: aiOutput(), model: "gpt-5.6-luna", responseId: "resp_1", durationMs: 5 }) };
  const proposals = new ProposalsService(prisma as any, settings as any, email as any, documents, ai as any);
  return { prisma, email, documents, proposals, ai };
}

const brief = { brief: "Diseño de logo e identidad para una cafetería, presupuesto 3 mil", customerName: "Café Aroma", customerEmail: "aroma@example.com", tone: "cercano" as const };

describe("ProposalsService — draft with AI", () => {
  it("asks YAPI (luna, metered) with the store's catalog and the merchant's words as data", async () => {
    const { proposals, ai } = setupProposals();
    await proposals.draft("m_1", "store_1", brief);
    expect(ai.structuredCompletion).toHaveBeenCalledTimes(1);
    const call = ai.structuredCompletion.mock.calls[0][0];
    expect(call).toEqual(expect.objectContaining({ storeId: "store_1", stage: "proposal-draft" }));
    expect(call.model).toBeUndefined(); // the helper's default: the luna tier
    const user = JSON.parse(call.user);
    expect(user.catalogo).toEqual([{ id: "pl_logo", nombre: "Diseño de logo", precio: 1500, moneda: "BOB", categoria: "Branding" }]);
    expect(user.pedido.trabajo).toBe(brief.brief);
    expect(call.system).toMatch(/tú/);
  });

  it("saves a DRAFT proposal: nine sections, catalog price, {{precio}} for the unknown one, 15 days of validity", async () => {
    const { proposals, prisma } = setupProposals();
    const before = Date.now();
    const doc = await proposals.draft("m_1", "store_1", brief);
    expect(doc).toEqual(expect.objectContaining({ kind: "PROPOSAL", status: "DRAFT", title: "Identidad visual para Café Aroma", numberLabel: "Borrador" }));
    expect(doc.ai).toEqual({ model: "gpt-5.6-luna" });
    expect((doc.content as Array<{ title: string }>).map((block) => block.title)).toEqual([
      "Introducción", "Entendimiento del problema", "Alcance", "Entregables", "Cronograma", "Inversión", "Condiciones de pago", "Revisiones", "Próximo paso",
    ]);
    expect(doc.items.map(({ description, unitAmount, paymentLinkId }) => ({ description, unitAmount, paymentLinkId }))).toEqual([
      { description: "Diseño de logo", unitAmount: 150000, paymentLinkId: "pl_logo" },
      { description: "Fotografía {{precio}}", unitAmount: 0, paymentLinkId: null },
    ]);
    expect(doc.totalAmount).toBe(150000);
    // The merchant's customer, never the model's.
    expect(doc.customer).toEqual({ name: "Café Aroma", email: "aroma@example.com", phone: null, document: null });
    const validUntil = new Date(doc.validUntil!).getTime();
    expect(validUntil - before).toBeGreaterThan(14 * 86_400_000);
    expect(validUntil - before).toBeLessThan(16 * 86_400_000);
    expect(new Date(doc.validUntil!).toISOString()).toMatch(/T03:59:59\.000Z$/);
    expect(prisma.events.filter((event) => event.documentId === doc.id).map((event) => event.type)).toEqual(["created", "ai_drafted"]);
    expect(prisma.events.find((event) => event.type === "ai_drafted")?.data).toEqual({ brief: brief.brief, budgetHint: null, deadline: null, tone: "cercano", model: "gpt-5.6-luna" });
  });

  it("never drafts for another merchant's store (and never calls the AI)", async () => {
    const { proposals, ai, prisma } = setupProposals();
    await expect(proposals.draft("m_2", "store_1", brief)).rejects.toThrow(NotFoundException);
    expect(ai.structuredCompletion).not.toHaveBeenCalled();
    expect(prisma.documents).toHaveLength(0);
  });

  it("cannot be sent while a price is still {{precio}}", async () => {
    const { proposals, documents } = setupProposals();
    const doc = await proposals.draft("m_1", "store_1", brief);
    await expect(documents.send("m_1", "store_1", doc.id, { email: false })).rejects.toThrow(UnprocessableEntityException);
    await expect(documents.send("m_1", "store_1", doc.id, { email: false })).rejects.toThrow(/\{\{precio\}\}/);
  });
});

describe("ProposalsService — regenerate one section", () => {
  it("rewrites one block with the brief as context and returns it guarded, same type and title", async () => {
    const { proposals, ai } = setupProposals();
    const doc = await proposals.draft("m_1", "store_1", brief);
    ai.structuredCompletion.mockResolvedValueOnce({ data: { text: "Una introducción mejor por Bs 9.999.", items: [] }, model: "gpt-5.6-luna", responseId: "r2", durationMs: 3 });
    const result = await proposals.regenerateSection("m_1", "store_1", doc.id, { block: { type: "paragraph", title: "Introducción", text: "Viejo" }, instruction: "más breve" });
    expect(result).toEqual({ block: { type: "paragraph", title: "Introducción", text: "Una introducción mejor por {{precio}}." } });
    const call = ai.structuredCompletion.mock.calls[1][0];
    expect(call.stage).toBe("proposal-section");
    const user = JSON.parse(call.user);
    expect(user.pedido.trabajo).toBe(brief.brief);
    expect(user.indicacion_del_comercio).toBe("más breve");
    expect(user.seccion_a_reescribir).toEqual({ tipo: "paragraph", titulo: "Introducción", texto: "Viejo", puntos: [] });
  });

  it("refuses a final proposal and anything that is not a proposal of this store", async () => {
    const { proposals, documents, prisma } = setupProposals();
    const doc = await proposals.draft("m_1", "store_1", brief);
    const block = { type: "paragraph" as const, title: "Introducción", text: "x" };
    await expect(proposals.regenerateSection("m_2", "store_1", doc.id, { block })).rejects.toThrow(NotFoundException);
    const cobro = await documents.create("m_1", "store_1", { kind: "INVOICE", title: "Cobro" });
    await expect(proposals.regenerateSection("m_1", "store_1", cobro.id, { block })).rejects.toThrow(NotFoundException);
    prisma.documents.find((row) => row.id === doc.id)!.status = "ACCEPTED";
    await expect(proposals.regenerateSection("m_1", "store_1", doc.id, { block })).rejects.toThrow(ConflictException);
  });
});

describe("proposals — list states and summary", () => {
  async function seed() {
    const ctx = setupProposals();
    const { documents, prisma } = ctx;
    const make = async (title: string, status: string, total: number, validUntil: Date | null) => {
      const doc = await documents.create("m_1", "store_1", { kind: "PROPOSAL", title, items: total ? [{ description: title, quantity: 1, unitAmount: total }] : [] });
      Object.assign(prisma.documents.find((row) => row.id === doc.id)!, { status, validUntil, currentVersion: status === "DRAFT" ? 0 : 1 });
      return doc.id;
    };
    const future = new Date(Date.now() + 5 * 86_400_000);
    const past = new Date(Date.now() - 86_400_000);
    const ids = {
      draft: await make("Borrador", "DRAFT", 1000, future),
      open: await make("Abierta", "VIEWED", 20000, future),
      changes: await make("Cambios", "CHANGES_REQUESTED", 30000, future),
      late: await make("Vencida sin worker", "SENT", 40000, past),
      accepted: await make("Aceptada", "ACCEPTED", 50000, future),
      voided: await make("Anulada", "VOIDED", 60000, future),
    };
    await documents.create("m_1", "store_1", { kind: "INVOICE", title: "Un cobro", items: [{ description: "x", quantity: 1, unitAmount: 999 }] });
    prisma.events.push({ id: "evt_acc", documentId: ids.accepted, type: "accepted", at: new Date(), data: { name: "Ana" } });
    return { ...ctx, ids };
  }

  it("filters proposals by tab on the server (past validity counts as closed at once)", async () => {
    const { documents, ids } = await seed();
    const titles = async (state: "open" | "accepted" | "draft" | "closed") =>
      (await documents.list("m_1", "store_1", { kind: "PROPOSAL", state })).map((row) => row.id).sort();
    expect(await titles("open")).toEqual([ids.open, ids.changes].sort());
    expect(await titles("accepted")).toEqual([ids.accepted]);
    expect(await titles("draft")).toEqual([ids.draft]);
    expect(await titles("closed")).toEqual([ids.late, ids.voided].sort());
  });

  it("summarizes counts and values over every proposal of the store", async () => {
    const { proposals } = await seed();
    const summary = await proposals.summary("m_1", "store_1");
    expect(summary.counts).toEqual({ all: 6, draft: 1, open: 2, changes: 1, accepted: 1, closed: 2 });
    expect(summary.totals).toEqual([{ currency: "BOB", open: 50000, accepted30: 50000 }]);
    await expect(proposals.summary("m_2", "store_1")).rejects.toThrow(NotFoundException);
  });
});
