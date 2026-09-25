import { ConflictException, ForbiddenException, HttpException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { BusinessDocumentsService } from "./business-documents.service";
import { ContractsService } from "./contracts.service";
import { PRICE_TOKEN, type ContractDraftOutput } from "./contract-draft";
import { CONTRACT_OUTLINE, splitContractContent } from "./contract-terms";
import { createDocumentLinkToken } from "./document-link-token";
import { FakePrisma } from "./testing/fake-document-prisma";

const SECRET = "test-document-link-secret-with-at-least-32-chars";
const CUSTOMER_CTX = { ipAddress: "181.115.1.2", userAgent: "Mozilla/5.0 iPhone" };
const MERCHANT_CTX = { ipAddress: "10.0.0.1", userAgent: "Mozilla/5.0 Mac" };
const ACTOR = { userId: "mu_1", email: "ana@andino.bo", sessionRef: "0123456789abcdef" };

function aiOutput(): ContractDraftOutput {
  return {
    title: "Contrato de diseño de identidad",
    clauses: CONTRACT_OUTLINE.servicios.map((clause) => ({
      key: clause.key,
      text: clause.key === "precio" ? `EL CLIENTE pagará ${PRICE_TOKEN}, 50% al firmar. Multa de Bs 9.999.` : `Texto de ${clause.title} para EL PRESTADOR y EL CLIENTE.`,
    })),
  };
}

function setup(config: Record<string, unknown> = {}) {
  const prisma = new FakePrisma();
  prisma.stores.push(
    { id: "store_1", merchantId: "m_1", name: "Estudio Andino", status: "ACTIVE", tagline: null, aboutText: null, logoUrl: null, contactEmail: "hola@andino.bo", contactPhone: null },
    { id: "store_2", merchantId: "m_2", name: "Otra", status: "ACTIVE", tagline: null, aboutText: null, logoUrl: null, contactEmail: null, contactPhone: null },
  );
  prisma.merchants.push({ id: "m_1", status: "ACTIVE", email: "cuenta@andino.bo" }, { id: "m_2", status: "ACTIVE", email: "otro@example.com" });
  prisma.invoicingProfiles.push({ id: "ip_1", merchantId: "m_1", razonSocial: "Estudio Andino SRL", nit: "1020304050" });
  prisma.kycSubmissions.push({ id: "kyc_1", merchantId: "m_1", status: "APPROVED", legalName: "Estudio Andino SRL", taxId: "1020304050", legalRepName: "Ana Quispe", legalRepDocumentId: "4455667", createdAt: new Date() });
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  const values: Record<string, unknown> = { "app.documentLinkSecret": SECRET, "app.checkoutOrigin": "https://pay.example/", "app.merchantDashboardOrigin": "https://panel.example", ...config };
  const settings = { get: (key: string) => values[key] };
  const documents = new BusinessDocumentsService(prisma as any, settings as any, email as any);
  const ai = { structuredCompletion: jest.fn().mockResolvedValue({ data: aiOutput(), model: "gpt-5.6-luna", responseId: "r", durationMs: 5 }) };
  const contracts = new ContractsService(prisma as any, settings as any, email as any, documents, ai as any);
  return { prisma, email, documents, contracts, ai };
}

const draftDto = {
  contractType: "servicios" as const,
  objeto: "Diseño de identidad visual para una cafetería",
  priceAmount: 300000,
  paymentTerms: "50% al firmar y 50% a la entrega",
  plazo: "30 días",
  city: "La Paz",
  customerName: "Café Illimani",
  customerDocument: "7788990",
  customerEmail: "compras@illimani.bo",
  customerAddress: "Calacoto 45",
};

/** A contract ready to send: drafted, the merchant's address filled, the price confirmed. */
async function readyContract(ctx: ReturnType<typeof setup>, overrides: Record<string, unknown> = {}) {
  const doc = await ctx.contracts.draft("m_1", "store_1", { ...draftDto, ai: false, ...overrides });
  const { meta, clauses } = splitContractContent(doc.content);
  await ctx.documents.update("m_1", "store_1", doc.id, { content: [{ type: "contract", contract: { ...meta, merchantParty: { ...meta.merchantParty, address: "Av. Arce 123" } } }, ...clauses] as any });
  return doc;
}

async function sent(ctx: ReturnType<typeof setup>, overrides: Record<string, unknown> = {}) {
  const doc = await readyContract(ctx, overrides);
  await ctx.documents.send("m_1", "store_1", doc.id, { email: false });
  return { id: doc.id, token: createDocumentLinkToken(doc.id, SECRET) };
}

/** The code in the last email sent to the customer. */
function lastCode(email: { send: jest.Mock }) {
  const call = [...email.send.mock.calls].reverse().find(([message]) => /código/i.test(message.subject));
  return /\b(\d{6})\b/.exec(call[0].body)![1];
}

async function customerSigns(ctx: ReturnType<typeof setup>, token: string, version = 1) {
  await ctx.contracts.requestCode(token, { version }, CUSTOMER_CTX);
  await ctx.contracts.verifyCode(token, { version, code: lastCode(ctx.email) }, CUSTOMER_CTX);
  return ctx.contracts.sign(token, { version, name: "Luis Mamani", method: "TYPED", readConfirmed: true }, CUSTOMER_CTX);
}

describe("ContractsService — draft", () => {
  it("asks YAPI (luna) with terms and role labels only, and saves a DRAFT contract with the parties outside the model's reach", async () => {
    const { contracts, ai, prisma } = setup();
    const before = Date.now();
    const doc = await contracts.draft("m_1", "store_1", draftDto);
    const call = ai.structuredCompletion.mock.calls[0][0];
    expect(call).toEqual(expect.objectContaining({ storeId: "store_1", stage: "contract-draft" }));
    expect(call.model).toBeUndefined();
    expect(call.user).not.toMatch(/Illimani|7788990|compras@|Calacoto|Andino|1020304050/);
    expect(doc).toEqual(expect.objectContaining({ kind: "CONTRACT", status: "DRAFT", title: "Contrato de diseño de identidad" }));
    expect(doc.customer).toEqual(expect.objectContaining({ name: "Café Illimani", document: "7788990", email: "compras@illimani.bo" }));
    const { meta, clauses } = splitContractContent(doc.content);
    expect((doc.content as Array<{ type: string }>)[0].type).toBe("contract");
    expect(meta).toEqual(expect.objectContaining({ contractType: "servicios", city: "La Paz", signingOrder: "merchant_first" }));
    expect(meta.merchantParty).toEqual(expect.objectContaining({ legalName: "Estudio Andino SRL", document: "1020304050", representative: "Ana Quispe", email: "hola@andino.bo", address: "" }));
    expect(meta.customerParty.address).toBe("Calacoto 45");
    expect(clauses.map((clause) => clause.title)).toEqual(CONTRACT_OUTLINE.servicios.map((clause) => clause.title));
    const precio = clauses.find((clause) => clause.title === "Precio y forma de pago")!.text!;
    expect(precio).toContain("Bs 3.000,00 (TRES MIL 00/100 BOLIVIANOS)");
    expect(precio).toContain("{{precio}}");
    expect(new Date(doc.validUntil!).getTime()).toBeGreaterThan(before + 29 * 24 * 3600 * 1000);
    expect(prisma.events.find((event) => event.documentId === doc.id && event.type === "ai_drafted")?.data).toEqual(expect.objectContaining({ contractType: "servicios", objeto: draftDto.objeto, model: "gpt-5.6-luna" }));
  });

  it("'Empezar sin IA' builds the template without calling the model", async () => {
    const { contracts, ai } = setup();
    const doc = await contracts.draft("m_1", "store_1", { ...draftDto, ai: false });
    expect(ai.structuredCompletion).not.toHaveBeenCalled();
    expect(doc.title).toBe("Contrato de prestación de servicios");
    expect(splitContractContent(doc.content).clauses[0].text).toContain("Diseño de identidad visual");
  });

  it("refuses another merchant's store", async () => {
    const { contracts } = setup();
    await expect(contracts.draft("m_2", "store_1", draftDto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("from an accepted proposal: the accepted version's total and customer, linked both ways", async () => {
    const ctx = setup();
    const proposal = await ctx.documents.create("m_1", "store_1", { kind: "PROPOSAL", title: "Identidad visual", customerName: "Café Illimani", customerEmail: "compras@illimani.bo", items: [{ description: "Logo", quantity: 1, unitAmount: 250000 }], content: [{ type: "list", title: "Alcance", items: ["Logo", "Manual"] }] });
    await expect(ctx.contracts.draft("m_1", "store_1", { contractType: "servicios", objeto: "", city: "La Paz", ai: false, fromProposalId: proposal.id })).rejects.toBeInstanceOf(ConflictException);
    await ctx.documents.send("m_1", "store_1", proposal.id, { email: false });
    ctx.prisma.documents.find((row) => row.id === proposal.id)!.status = "ACCEPTED";
    ctx.prisma.events.push({ id: "evt_acc", documentId: proposal.id, type: "accepted", version: 1, at: new Date(), dedupeKey: "accepted", data: { name: "Luis", email: "luis@illimani.bo", version: 1 } });
    const doc = await ctx.contracts.draft("m_1", "store_1", { contractType: "servicios", objeto: "", city: "La Paz", ai: false, fromProposalId: proposal.id });
    expect(doc.customer).toEqual(expect.objectContaining({ name: "Café Illimani", email: "compras@illimani.bo" }));
    const text = splitContractContent(doc.content).clauses.map((clause) => clause.text).join("\n");
    expect(text).toContain("Bs 2.500,00 (DOS MIL QUINIENTOS 00/100 BOLIVIANOS)");
    expect(text).toContain("Identidad visual");
    expect(ctx.prisma.events.some((event) => event.documentId === proposal.id && event.type === "contract_created" && event.data.contractId === doc.id)).toBe(true);
    expect(ctx.prisma.events.find((event) => event.documentId === doc.id && event.type === "created")?.data).toEqual({ fromProposal: proposal.id });
  });
});

describe("ContractsService — sending (D0 with contract rules)", () => {
  it("placeholders in the parties and a missing customer email block the send", async () => {
    const ctx = setup();
    const doc = await ctx.contracts.draft("m_1", "store_1", { ...draftDto, ai: false });
    await expect(ctx.documents.send("m_1", "store_1", doc.id, { email: false })).rejects.toThrow(/domicilio del comercio/);
    const noEmail = await readyContract(ctx, { customerEmail: undefined });
    await expect(ctx.documents.send("m_1", "store_1", noEmail.id, { email: false })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("freezes issuer and parties in the hashed version and emails a 'Revisar y firmar' link with the contract PDF", async () => {
    const ctx = setup();
    const doc = await readyContract(ctx);
    const result = await ctx.documents.send("m_1", "store_1", doc.id, {});
    expect(result.document.numberLabel).toBe("CON-0001");
    const version = ctx.prisma.versions.find((row) => row.documentId === doc.id)!;
    expect(version.content.contract.merchantParty).toEqual(expect.objectContaining({ legalName: "Estudio Andino SRL", address: "Av. Arce 123" }));
    expect(version.content.blocks.every((block: { type: string }) => block.type === "clause")).toBe(true);
    const mail = ctx.email.send.mock.calls[0][0];
    expect(mail.body).toContain("Revisar y firmar");
    expect(mail.attachments[0].filename).toBe("CON-0001.pdf");
  });
});

describe("ContractsService — signing codes", () => {
  it("waits for the merchant when the merchant signs first", async () => {
    const ctx = setup();
    const { token } = await sent(ctx);
    await expect(ctx.contracts.requestCode(token, { version: 1 }, CUSTOMER_CTX)).rejects.toThrow(/Esperando la firma de Estudio Andino/);
  });

  it("emails a 6-digit code to the frozen customer email, keeping only its HMAC", async () => {
    const ctx = setup();
    const { id, token } = await sent(ctx, { signingOrder: "customer_first" });
    const result = await ctx.contracts.requestCode(token, { version: 1 }, CUSTOMER_CTX);
    expect(result.sentTo).toBe("c***@illimani.bo");
    const mail = ctx.email.send.mock.calls.at(-1)![0];
    expect(mail.to).toBe("compras@illimani.bo");
    const code = lastCode(ctx.email);
    const event = ctx.prisma.events.find((row) => row.documentId === id && row.type === "sign_code_sent")!;
    expect(JSON.stringify(event.data)).not.toContain(code);
    expect(event.data.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("limits codes: one a minute, five a day, and inside the store's daily email cap", async () => {
    const ctx = setup();
    const { id, token } = await sent(ctx, { signingOrder: "customer_first" });
    await ctx.contracts.requestCode(token, { version: 1 }, CUSTOMER_CTX);
    await expect(ctx.contracts.requestCode(token, { version: 1 }, CUSTOMER_CTX)).rejects.toThrow(/minuto/);
    const age = () => ctx.prisma.events.filter((row) => row.documentId === id && row.type === "sign_code_sent").forEach((row) => { row.at = new Date(row.at.getTime() - 61_000); });
    for (let index = 0; index < 4; index += 1) {
      age();
      await ctx.contracts.requestCode(token, { version: 1 }, CUSTOMER_CTX);
    }
    age();
    const error = await ctx.contracts.requestCode(token, { version: 1 }, CUSTOMER_CTX).catch((failure) => failure);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);

    const capped = setup({ "app.documentEmailsPerDay": 1 });
    const other = await sent(capped, { signingOrder: "customer_first" });
    await capped.contracts.requestCode(other.token, { version: 1 }, CUSTOMER_CTX);
    capped.prisma.events.filter((row) => row.type === "sign_code_sent").forEach((row) => { row.at = new Date(row.at.getTime() - 61_000); });
    await expect(capped.contracts.requestCode(other.token, { version: 1 }, CUSTOMER_CTX)).rejects.toThrow(/límite/);
  });

  it("verifies: wrong codes count down, five kill the code (even the right one after), an old code expires", async () => {
    const ctx = setup();
    const { id, token } = await sent(ctx, { signingOrder: "customer_first" });
    await ctx.contracts.requestCode(token, { version: 1 }, CUSTOMER_CTX);
    const code = lastCode(ctx.email);
    const wrong = code === "000000" ? "111111" : "000000";
    await expect(ctx.contracts.verifyCode(token, { version: 1, code: wrong }, CUSTOMER_CTX)).rejects.toThrow(/Te quedan 4 intentos/);
    for (let index = 0; index < 4; index += 1) await ctx.contracts.verifyCode(token, { version: 1, code: wrong }, CUSTOMER_CTX).catch(() => undefined);
    await expect(ctx.contracts.verifyCode(token, { version: 1, code }, CUSTOMER_CTX)).rejects.toThrow(/código nuevo/);

    ctx.prisma.events.filter((row) => row.documentId === id && row.type === "sign_code_sent").forEach((row) => { row.at = new Date(row.at.getTime() - 61_000); });
    await ctx.contracts.requestCode(token, { version: 1 }, CUSTOMER_CTX);
    const fresh = lastCode(ctx.email);
    const latest = ctx.prisma.events.filter((row) => row.documentId === id && row.type === "sign_code_sent").at(-1)!;
    latest.data = { ...latest.data, expiresAt: new Date(Date.now() - 1000).toISOString() };
    await expect(ctx.contracts.verifyCode(token, { version: 1, code: fresh }, CUSTOMER_CTX)).rejects.toThrow(/venció/);
  });
});

describe("ContractsService — signatures", () => {
  it("the customer cannot sign without a verified code, nor a version the merchant replaced", async () => {
    const ctx = setup();
    const { id, token } = await sent(ctx, { signingOrder: "customer_first" });
    await expect(ctx.contracts.sign(token, { version: 1, name: "Luis Mamani", method: "TYPED", readConfirmed: true }, CUSTOMER_CTX)).rejects.toBeInstanceOf(ForbiddenException);
    await ctx.contracts.requestCode(token, { version: 1 }, CUSTOMER_CTX);
    await ctx.contracts.verifyCode(token, { version: 1, code: lastCode(ctx.email) }, CUSTOMER_CTX);
    await ctx.documents.update("m_1", "store_1", id, { title: "Contrato corregido" });
    await ctx.documents.send("m_1", "store_1", id, { email: false });
    await expect(ctx.contracts.sign(token, { version: 1, name: "Luis Mamani", method: "TYPED", readConfirmed: true }, CUSTOMER_CTX)).rejects.toThrow(/actualizó el contrato/);
    await expect(ctx.contracts.sign(token, { version: 2, name: "Luis Mamani", method: "TYPED", readConfirmed: true }, CUSTOMER_CTX)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("both sign (merchant first): SIGNED with full evidence, signed copies to both parties once", async () => {
    const ctx = setup();
    const { id, token } = await sent(ctx);
    const merchant = await ctx.contracts.merchantSign("m_1", "store_1", id, { version: 1, name: "Ana Quispe", method: "TYPED" }, ACTOR, MERCHANT_CTX);
    expect(merchant.status).toBe("SENT");
    expect(merchant.signing).toEqual(expect.objectContaining({ merchantSigned: true, customerSigned: false }));
    const signedEvent = ctx.prisma.events.find((row) => row.documentId === id && row.type === "signed")!;
    expect(signedEvent.data).toEqual(expect.objectContaining({ role: "MERCHANT", userId: "mu_1", sessionRef: "0123456789abcdef" }));

    const result = await customerSigns(ctx, token);
    expect(result.status).toBe("SIGNED");
    const version = ctx.prisma.versions.find((row) => row.documentId === id)!;
    const customer = ctx.prisma.signatures.find((row) => row.documentId === id && row.role === "CUSTOMER")!;
    expect(customer).toEqual(expect.objectContaining({ name: "Luis Mamani", method: "TYPED", email: "compras@illimani.bo", ipAddress: "181.115.1.2", userAgent: "Mozilla/5.0 iPhone", version: 1, versionSha256: version.sha256 }));
    expect(customer.codeVerifiedAt).toBeInstanceOf(Date);
    const merchantRow = ctx.prisma.signatures.find((row) => row.documentId === id && row.role === "MERCHANT")!;
    expect(merchantRow).toEqual(expect.objectContaining({ email: "ana@andino.bo", codeVerifiedAt: null, ipAddress: "10.0.0.1" }));
    expect(ctx.prisma.documents.find((row) => row.id === id)!.status).toBe("SIGNED");

    const copies = ctx.email.send.mock.calls.map(([message]) => message).filter((message) => /firmado/i.test(message.subject));
    expect(copies.map((message) => message.to).sort()).toEqual(["compras@illimani.bo", "hola@andino.bo"]);
    expect(copies.every((message) => message.attachments?.[0]?.filename === "CON-0001-firmado.pdf")).toBe(true);

    const again = await ctx.contracts.sign(token, { version: 1, name: "Luis Mamani", method: "TYPED", readConfirmed: true }, CUSTOMER_CTX);
    expect(again.status).toBe("SIGNED");
    expect(ctx.email.send.mock.calls.filter(([message]) => /firmado/i.test(message.subject))).toHaveLength(2);
    await expect(ctx.documents.void("m_1", "store_1", id, {})).rejects.toBeInstanceOf(ConflictException);
    await expect(ctx.documents.update("m_1", "store_1", id, { title: "x" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("a drawn signature must be a PNG and is kept with the signature", async () => {
    const ctx = setup();
    const { id, token } = await sent(ctx, { signingOrder: "customer_first" });
    await ctx.contracts.requestCode(token, { version: 1 }, CUSTOMER_CTX);
    await ctx.contracts.verifyCode(token, { version: 1, code: lastCode(ctx.email) }, CUSTOMER_CTX);
    await expect(ctx.contracts.sign(token, { version: 1, name: "Luis Mamani", method: "DRAWN", image: "data:image/svg+xml;base64,PHN2Zz4=", readConfirmed: true }, CUSTOMER_CTX)).rejects.toThrow(/PNG/);
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    await ctx.contracts.sign(token, { version: 1, name: "Luis Mamani", method: "DRAWN", image: png, readConfirmed: true }, CUSTOMER_CTX);
    expect(ctx.prisma.signatures.find((row) => row.documentId === id)!.imageUrl).toBe(png);
  });

  it("the customer must confirm having read it", async () => {
    const ctx = setup();
    const { token } = await sent(ctx, { signingOrder: "customer_first" });
    await expect(ctx.contracts.sign(token, { version: 1, name: "Luis Mamani", method: "TYPED", readConfirmed: false }, CUSTOMER_CTX)).rejects.toThrow(/leído/);
  });

  it("customer first: the merchant waits, the merchant hears about it, and the contract is locked for edits but can be voided", async () => {
    const ctx = setup();
    const { id, token } = await sent(ctx, { signingOrder: "customer_first" });
    await expect(ctx.contracts.merchantSign("m_1", "store_1", id, { version: 1, name: "Ana", method: "TYPED" }, ACTOR, MERCHANT_CTX)).rejects.toThrow(/cliente firme primero/);
    const result = await customerSigns(ctx, token);
    expect(result.status).toBe("VIEWED");
    expect(ctx.email.send.mock.calls.some(([message]) => message.to === "hola@andino.bo" && /firmó/.test(message.subject))).toBe(true);
    await expect(ctx.documents.update("m_1", "store_1", id, { title: "Otro" })).rejects.toThrow(/ya firmó/);
    const voided = await ctx.documents.void("m_1", "store_1", id, {});
    expect(voided.status).toBe("VOIDED");
    expect(ctx.prisma.signatures.filter((row) => row.documentId === id)).toHaveLength(1);
  });

  it("a merchant who edits after signing re-sends a new version that needs both signatures again", async () => {
    const ctx = setup();
    const { id } = await sent(ctx);
    await ctx.contracts.merchantSign("m_1", "store_1", id, { version: 1, name: "Ana", method: "TYPED" }, ACTOR, MERCHANT_CTX);
    await ctx.documents.update("m_1", "store_1", id, { title: "Contrato corregido" });
    await ctx.documents.send("m_1", "store_1", id, { email: false });
    const detail = await ctx.documents.get("m_1", "store_1", id);
    expect(detail.currentVersion).toBe(2);
    expect(detail.signing).toEqual(expect.objectContaining({ merchantSigned: false, customerSigned: false }));
    await expect(ctx.contracts.merchantSign("m_1", "store_1", id, { version: 1, name: "Ana", method: "TYPED" }, ACTOR, MERCHANT_CTX)).rejects.toThrow(/versión/);
  });
});

describe("ContractsService — public view, expiry, list", () => {
  it("the public view says who must sign next and where the code goes", async () => {
    const ctx = setup();
    const { id, token } = await sent(ctx);
    const view = await ctx.documents.publicView(token, CUSTOMER_CTX) as any;
    expect(view.kind).toBe("CONTRACT");
    expect(view.document.contract.merchantParty.legalName).toBe("Estudio Andino SRL");
    expect(view.signing).toEqual(expect.objectContaining({ waitingFor: "merchant", signable: false, codeSentTo: "c***@illimani.bo", verified: false, signatures: [] }));
    await ctx.contracts.merchantSign("m_1", "store_1", id, { version: 1, name: "Ana", method: "TYPED" }, ACTOR, MERCHANT_CTX);
    const next = await ctx.documents.publicView(token, CUSTOMER_CTX) as any;
    expect(next.signing).toEqual(expect.objectContaining({ waitingFor: "customer", signable: true }));
    expect(next.signing.signatures).toEqual([expect.objectContaining({ role: "MERCHANT", name: "Ana" })]);
  });

  it("past its signing deadline a contract expires on read and refuses codes", async () => {
    const ctx = setup();
    const { id, token } = await sent(ctx, { signingOrder: "customer_first" });
    ctx.prisma.documents.find((row) => row.id === id)!.validUntil = new Date(Date.now() - 1000);
    const view = await ctx.documents.publicView(token, CUSTOMER_CTX) as any;
    expect(view.status).toBe("EXPIRED");
    await expect(ctx.contracts.requestCode(token, { version: 1 }, CUSTOMER_CTX)).rejects.toThrow(/venció/);
    expect(await ctx.contracts.expireOverdue()).toBe(0);
  });

  it("list states and the summary", async () => {
    const ctx = setup();
    await ctx.contracts.draft("m_1", "store_1", { ...draftDto, ai: false });
    const open = await sent(ctx, { signingOrder: "customer_first" });
    const signed = await sent(ctx);
    await ctx.contracts.merchantSign("m_1", "store_1", signed.id, { version: 1, name: "Ana", method: "TYPED" }, ACTOR, MERCHANT_CTX);
    await customerSigns(ctx, signed.token);
    const ids = async (state: "draft" | "open" | "signed" | "closed") => (await ctx.documents.list("m_1", "store_1", { kind: "CONTRACT", state })).map((doc) => doc.id);
    expect(await ids("open")).toEqual([open.id]);
    expect(await ids("signed")).toEqual([signed.id]);
    expect(await ids("draft")).toHaveLength(1);
    const summary = await ctx.contracts.summary("m_1", "store_1");
    expect(summary).toEqual(expect.objectContaining({ all: 3, draft: 1, open: 1, signed: 1, closed: 0, awaitingYou: 0 }));
  });

  it("regenerates one clause (guarded, not saved) and refuses once the customer signed", async () => {
    const ctx = setup();
    const doc = await ctx.contracts.draft("m_1", "store_1", draftDto);
    ctx.ai.structuredCompletion.mockResolvedValueOnce({ data: { text: `Pagará ${PRICE_TOKEN} y Bs 12.345.` }, model: "gpt-5.6-luna", responseId: "r", durationMs: 1 });
    const { block } = await ctx.contracts.regenerateClause("m_1", "store_1", doc.id, { index: 1, instruction: "más corto" });
    expect(block).toEqual({ type: "clause", title: "Precio y forma de pago", text: "Pagará Bs 3.000,00 (TRES MIL 00/100 BOLIVIANOS) y {{precio}}." });
    expect(ctx.ai.structuredCompletion.mock.calls.at(-1)![0].stage).toBe("contract-clause");
    await expect(ctx.contracts.regenerateClause("m_1", "store_1", doc.id, { index: 99 })).rejects.toBeInstanceOf(NotFoundException);
  });
});
