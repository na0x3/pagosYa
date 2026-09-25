import { expect, test } from "@playwright/test";

// Documentos → Contratos: pick a type, YAPI drafts the clauses (mocked: no AI call ever leaves
// the test), fill the parties, confirm amounts, sign and send; follow signatures; turn an
// accepted proposal into a contract.
const store = {
  id: "store_1", merchantId: "merchant_1", slug: "andino", name: "Estudio Andino", status: "ACTIVE",
  websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, heroSlides: [], contentOrder: [], editorialGallery: [],
  links: [], locations: [], animations: [], customDomains: [], checkoutMode: "payment", contactPhone: null, contactEmail: "hola@andino.bo",
};

const SHOTS = process.env.CONTRACTS_SHOTS_DIR;
/** A screenshot once the sheet's entrance animation has settled. */
async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}
const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString();
const OPEN = ["SENT", "VIEWED"];

const merchantParty = { legalName: "Estudio Andino SRL", document: "1020304050", representative: "Ana Quispe", representativeDocument: "4455667", address: "", email: "hola@andino.bo" };
const meta = (overrides = {}) => ({ contractType: "servicios", city: "La Paz", signingOrder: "merchant_first", merchantParty: { ...merchantParty }, customerParty: { address: "Calacoto 45", representative: "", representativeDocument: "" }, ...overrides });
const AI_CLAUSES = [
  { type: "clause", title: "Objeto", text: "Por el presente contrato, EL PRESTADOR se compromete a prestar a favor de EL CLIENTE el diseño de identidad visual para una cafetería." },
  { type: "clause", title: "Precio y forma de pago", text: "El precio acordado es de Bs 3.000,00 (TRES MIL 00/100 BOLIVIANOS): Bs 1.500 a la firma y el saldo a la entrega. {{confirmar monto}}" },
  { type: "clause", title: "Plazo", text: "El trabajo se entregará en 30 días calendario desde la firma." },
  { type: "clause", title: "Obligaciones de EL PRESTADOR", text: "Entregar los archivos finales en formatos editables." },
  { type: "clause", title: "Jurisdicción y ley aplicable", text: "El presente contrato se rige por las leyes del Estado Plurinacional de Bolivia." },
];

function contract(overrides = {}) {
  const id = overrides.id || "con_9";
  return {
    id, kind: "CONTRACT", number: 9, numberLabel: "CON-0009", status: "VIEWED", title: "Contrato de mantenimiento", currency: "BOB",
    customer: { name: "Luis Mamani", email: "luis@illimani.bo", phone: "70000000", document: "7788990" },
    items: [], subtotalAmount: 0, discountAmount: 0, totalAmount: 0,
    content: [{ type: "contract", contract: meta({ merchantParty: { ...merchantParty, address: "Av. Arce 123" } }) }, ...AI_CLAUSES.map((clause) => ({ ...clause, text: clause.text.replace(" {{confirmar monto}}", "") }))],
    dueAt: null, validUntil: inDays(20), currentVersion: 1, sentAt: inDays(-2), viewedAt: inDays(-1), voidedAt: null, paidAt: null,
    publicUrl: `http://localhost:5175/d/tok_${id}`, createdAt: inDays(-2),
    signing: { merchant: null, customer: null, merchantSigned: false, customerSigned: false, order: "merchant_first", waitingFor: "merchant" },
    events: [{ id: "a", type: "created", at: inDays(-2) }, { id: "b", type: "sent", version: 1, at: inDays(-2) }, { id: "c", type: "viewed", version: 1, at: inDays(-1) }],
    ...overrides,
  };
}

function fakeApi(initial = [], { aiDown = false } = {}) {
  const documents = [...initial];
  const requests = [];
  let number = { CONTRACT: documents.reduce((max, doc) => Math.max(max, doc.kind === "CONTRACT" ? doc.number || 0 : 0), 0) };
  const detail = (doc) => ({ editTag: "tag0", ...doc, previewUrl: doc.publicUrl ? `${doc.publicUrl}?preview=prev` : null, versions: [], events: doc.events || [] });
  const late = (doc) => doc.status === "EXPIRED" || doc.status === "VOIDED" || (OPEN.includes(doc.status) && doc.validUntil && new Date(doc.validUntil) < new Date());
  const orderOf = (doc) => (doc.content || []).find((block) => block.type === "contract")?.contract?.signingOrder || "merchant_first";
  const refreshSigning = (doc) => {
    const s = doc.signing || {};
    const next = doc.status === "SIGNED" || !OPEN.includes(doc.status) ? null : orderOf(doc) === "customer_first" ? (s.customerSigned ? "merchant" : "customer") : (s.merchantSigned ? "customer" : "merchant");
    doc.signing = { merchant: s.merchant || null, customer: s.customer || null, merchantSigned: Boolean(s.merchantSigned), customerSigned: Boolean(s.customerSigned), order: orderOf(doc), waitingFor: next };
  };
  function create(body, extra = {}) {
    const doc = {
      id: `con_${documents.length + 1}`, kind: body.kind, number: null, numberLabel: "Borrador", status: "DRAFT", title: body.title, currency: "BOB",
      customer: { name: body.customerName ?? null, email: body.customerEmail ?? null, phone: body.customerPhone ?? null, document: body.customerDocument ?? null },
      items: [], subtotalAmount: 0, discountAmount: 0, totalAmount: 0, content: body.content || [], dueAt: null, validUntil: body.validUntil ?? inDays(30),
      currentVersion: 0, sentAt: null, viewedAt: null, voidedAt: null, paidAt: null, publicUrl: null, createdAt: new Date().toISOString(),
      signing: { merchant: null, customer: null, merchantSigned: false, customerSigned: false, order: "merchant_first", waitingFor: null },
      events: [{ id: "e1", type: "created", at: new Date().toISOString() }], ...extra,
    };
    documents.unshift(doc);
    return doc;
  }
  async function handle(route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/v1", "");
    const method = request.method();
    const body = request.postData() ? request.postDataJSON() : undefined;
    requests.push({ method, path, body, query: url.search, headers: request.headers() });
    const json = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path === "/stores") return json([store]);
    if (path === "/merchants/balance") return json({ payableBalance: 0 });
    if (path === "/merchants/kyc") return json({ status: "APPROVED" });
    if (path === "/merchants/invoicing_profile") return json({ status: "CONFIGURED", cuis: "CUIS-1" });
    if (path === "/merchants/finances") return json({ totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" });
    if (path === "/stores/store_1/contracts/summary") {
      const rows = documents.filter((doc) => doc.kind === "CONTRACT");
      rows.forEach(refreshSigning);
      const open = rows.filter((doc) => OPEN.includes(doc.status) && !late(doc));
      return json({ all: rows.length, draft: rows.filter((doc) => doc.status === "DRAFT").length, open: open.length, signed: rows.filter((doc) => doc.status === "SIGNED").length, closed: rows.filter(late).length, awaitingYou: open.filter((doc) => doc.signing.waitingFor === "merchant").length });
    }
    if (path === "/stores/store_1/proposals/summary") {
      const rows = documents.filter((doc) => doc.kind === "PROPOSAL");
      return json({ counts: { all: rows.length, draft: 0, open: 0, changes: 0, accepted: rows.length, closed: 0 }, totals: [{ currency: "BOB", open: 0, accepted30: 250000 }] });
    }
    if (path === "/stores/store_1/contracts/draft") {
      if (aiDown && body.ai !== false) return json({ statusCode: 503, message: "La asistencia con IA no está configurada. Agrega OPENAI_API_KEY en el servidor." }, 503);
      const doc = create({
        kind: "CONTRACT", title: body.ai === false ? "Contrato de prestación de servicios" : "Contrato de diseño de identidad visual",
        customerName: body.customerName, customerEmail: body.customerEmail, customerPhone: body.customerPhone, customerDocument: body.customerDocument,
        content: [{ type: "contract", contract: meta({ contractType: body.contractType, city: body.city || "", signingOrder: body.signingOrder, customerParty: { address: body.customerAddress || "", representative: "", representativeDocument: "" } }) }, ...AI_CLAUSES.map((clause) => ({ ...clause }))],
      }, body.fromProposalId ? {} : {});
      doc.events.push({ id: "e2", type: "ai_drafted", at: new Date().toISOString(), data: { model: body.ai === false ? null : "gpt-5.6-luna" } });
      return json({ ...detail(doc), ai: body.ai === false ? null : { model: "gpt-5.6-luna" } });
    }
    if (path === "/stores/store_1/documents" && method === "GET") {
      const kind = url.searchParams.get("kind");
      const state = url.searchParams.get("state");
      const rows = documents.filter((doc) => doc.kind === kind && (!state
        || (state === "open" ? OPEN.includes(doc.status) && !late(doc) : state === "signed" ? doc.status === "SIGNED" : state === "accepted" ? doc.status === "ACCEPTED" : state === "draft" ? doc.status === "DRAFT" : late(doc))));
      rows.forEach(refreshSigning);
      return json(rows.map(detail));
    }
    if (path === "/stores/store_1/documents" && method === "POST") return json(detail(create(body)));
    const contractMatch = /^\/stores\/store_1\/contracts\/([^/]+)\/(sign|regenerate-clause)$/.exec(path);
    if (contractMatch) {
      const doc = documents.find((row) => row.id === contractMatch[1]);
      if (contractMatch[2] === "regenerate-clause") {
        const clauses = doc.content.filter((block) => block.type !== "contract");
        return json({ block: { type: "clause", title: clauses[body.index].title, text: "Texto reescrito por YAPI, más claro y breve." } });
      }
      if (body.version !== doc.currentVersion) return json({ statusCode: 409, message: "Esta ya no es la versión vigente del contrato." }, 409);
      doc.signing = { ...doc.signing, merchantSigned: true, merchant: { name: body.name, method: body.method, signedAt: new Date().toISOString() } };
      doc.events.push({ id: `s${doc.events.length}`, type: "signed", version: doc.currentVersion, at: new Date().toISOString(), data: { role: "MERCHANT", name: body.name } });
      if (doc.signing.customerSigned) { doc.status = "SIGNED"; doc.events.push({ id: "fs", type: "fully_signed", version: doc.currentVersion, at: new Date().toISOString() }); }
      refreshSigning(doc);
      return json(detail(doc));
    }
    const match = /^\/stores\/store_1\/documents\/([^/]+)(?:\/(send|shared|void))?$/.exec(path);
    if (match) {
      const doc = documents.find((row) => row.id === match[1]);
      if (!doc) return json({ message: "Documento no encontrado" }, 404);
      refreshSigning(doc);
      if (!match[2] && method === "GET") return json(detail(doc));
      if (!match[2] && method === "DELETE") { documents.splice(documents.indexOf(doc), 1); return json({ deleted: true }); }
      if (!match[2] && method === "PATCH") {
        if (["SIGNED", "EXPIRED", "VOIDED"].includes(doc.status) || doc.signing?.customerSigned) return json({ statusCode: 409, message: "Tu cliente ya firmó esta versión: fírmala o anúlala para cambiarla." }, 409);
        doc.editTag = `tag${requests.length}`;
        if (body.title !== undefined) doc.title = body.title;
        doc.customer = { name: body.customerName ?? doc.customer.name, email: body.customerEmail ?? doc.customer.email, phone: body.customerPhone ?? doc.customer.phone, document: body.customerDocument ?? doc.customer.document };
        if (body.content) doc.content = body.content;
        if (body.validUntil) doc.validUntil = body.validUntil;
        return json(detail(doc));
      }
      if (match[2] === "send") {
        const pending = [...JSON.stringify(doc.content).matchAll(/\{\{[^{}]+\}\}/g)];
        const party = doc.content.find((block) => block.type === "contract")?.contract?.merchantParty;
        if (pending.length || (party && !party.address)) return json({ message: `Completa los datos pendientes antes de enviar: ${pending.join(", ") || "{{domicilio del comercio}}"}` }, 422);
        const changed = doc.status === "DRAFT" || doc.dirtyForSend;
        if (!doc.number) { number.CONTRACT += 1; doc.number = number.CONTRACT; doc.numberLabel = `CON-${String(doc.number).padStart(4, "0")}`; }
        if (changed) { doc.status = "SENT"; doc.currentVersion += 1; }
        doc.sentAt = new Date().toISOString();
        doc.publicUrl = `http://localhost:5175/d/tok_${doc.id}`;
        doc.events.push({ id: `e${doc.events.length + 1}`, type: "sent", version: doc.currentVersion, at: new Date().toISOString(), data: changed ? {} : { resend: true } });
        refreshSigning(doc);
        return json({ document: detail(doc), publicUrl: doc.publicUrl, emailed: body?.email !== false && Boolean(doc.customer.email) });
      }
      if (match[2] === "shared") return json({ shared: true });
      if (match[2] === "void") { doc.status = "VOIDED"; refreshSigning(doc); return json(detail(doc)); }
    }
    return json([]);
  }
  return { documents, requests, handle };
}

async function openContracts(page, api, view = "contracts") {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:5175/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><main>Contrato</main>" }));
  await page.route("http://localhost:3001/v1/**", api.handle);
  await page.goto(`/#dashboard-${view}`);
  await expect(page.locator("body")).toHaveAttribute("data-dashboard-view", view);
}

for (const width of [390, 1280]) {
  test.describe(`contracts at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test("first contract: an example, the guided composer, an AI draft, complete the parties, confirm the amount, sign and send", async ({ page }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const api = fakeApi();
      await openContracts(page, api);

      const empty = page.locator("[data-contracts-empty]");
      await expect(empty).toContainText("Contratos listos para firmar");
      await expect(empty.locator("[data-contract-example]")).toHaveCount(4);
      await expect(empty).toContainText("consulta a un abogado o notario");
      await shot(page, `dashboard-empty-${width}`);
      await empty.getByRole("button", { name: /Diseño de logo/ }).click();

      const sheet = page.locator("[data-contract-sheet]");
      await expect(sheet.getByRole("radio", { name: /Servicios/ })).toBeChecked();
      await expect(sheet.getByLabel("Objeto del contrato")).toHaveValue(/cafetería/);
      await expect(sheet.locator("[data-contract-notary-notice]")).toContainText("consulta a un abogado o notario");
      // Alquiler shows its own notice (inmuebles need a notary).
      await sheet.getByRole("radio", { name: /Alquiler/ }).check();
      await expect(sheet.locator("[data-contract-type-notice]")).toContainText("inmueble");
      await sheet.getByRole("radio", { name: /Servicios/ }).check();
      await expect(sheet.locator("[data-contract-type-notice]")).toBeHidden();
      await sheet.getByLabel("Nombre o razón social del cliente").fill("Café Illimani SRL");
      await sheet.getByLabel("CI o NIT del cliente").fill("7788990");
      await sheet.getByLabel("Correo del cliente").fill("compras@illimani.bo");
      await sheet.getByLabel("Domicilio del cliente").fill("Calacoto 45");
      await sheet.getByLabel("Precio acordado").fill("3.000");
      await sheet.getByLabel("Ciudad").selectOption("La Paz");
      await shot(page, `dashboard-compose-${width}`);
      await sheet.getByRole("button", { name: "Redactar con IA" }).click();

      const draft = api.requests.find((request) => request.path === "/stores/store_1/contracts/draft");
      expect(draft.body).toEqual(expect.objectContaining({ contractType: "servicios", priceAmount: 300000, city: "La Paz", customerDocument: "7788990", customerEmail: "compras@illimani.bo", customerAddress: "Calacoto 45", signingOrder: "merchant_first", ai: true }));

      const editor = page.locator("[data-contract-editor]");
      await expect(editor).toBeVisible();
      await expect(editor.locator("[data-contract-ai-notice]")).toContainText("Borrador generado con IA — revísalo; no es asesoría legal");
      const pending = editor.locator("[data-contract-pending]");
      await expect(pending).toContainText("Tu domicilio (comercio)");
      await expect(pending).toContainText("Confirma el monto de «Precio y forma de pago»");
      const send = page.locator("[data-contract-send]");
      await expect(send).toBeDisabled();
      await expect(page.locator("[data-contract-pending-jump]")).toHaveText("Faltan 2 datos ›");
      await shot(page, `dashboard-draft-${width}`);

      // Jump from the pending list to the field, fill it.
      await pending.getByRole("button", { name: "Tu domicilio (comercio)" }).click();
      await expect(editor.locator('[data-party="merchant"][data-field="address"]')).toBeFocused();
      await editor.locator('[data-party="merchant"][data-field="address"]').fill("Av. Arce 2345, La Paz");
      // Confirm the amount taken from the merchant's words.
      await editor.locator('[data-contract-clause="1"] [data-contract-confirm-amount]').click();
      await expect(editor.locator('[data-contract-clause="1"] [data-clause-field="text"]')).not.toHaveValue(/confirmar monto/);
      // Regenerate one clause, move another, add one.
      await editor.locator('[data-contract-clause="3"] [data-contract-regenerate]').click();
      await expect(editor.locator('[data-contract-clause="3"] [data-clause-field="text"]')).toHaveValue("Texto reescrito por YAPI, más claro y breve.");
      await editor.locator('[data-contract-clause="2"] [data-contract-move="1"]').click();
      await expect(editor.locator('[data-contract-clause="3"] [data-clause-field="title"]')).toHaveValue("Plazo");
      if (SHOTS) {
        await editor.locator('[data-contract-clause="1"]').scrollIntoViewIfNeeded();
        await shot(page, `dashboard-clauses-${width}`);
      }
      await expect(pending).toBeHidden();
      await expect(send).toBeEnabled();
      await expect(send).toHaveText(/Firmar y enviar/);
      await send.click();

      // The merchant's signature, then the send.
      const signer = page.locator("[data-contract-signer]");
      await expect(signer).toBeVisible();
      await expect(sheet.getByLabel("Tu nombre completo")).toHaveValue("Ana Quispe");
      await expect(signer.locator("[data-contract-sign-preview]")).toHaveText("Ana Quispe");
      await shot(page, `dashboard-sign-${width}`);
      await sheet.getByRole("button", { name: "Firmar y enviar" }).click();
      await expect(sheet.locator("[data-contract-share]")).toBeVisible();
      await expect(sheet).toContainText("Firmaste CON-0001");
      await expect(sheet).toContainText("Le enviamos a compras@illimani.bo");
      await shot(page, `dashboard-share-${width}`);

      const saves = api.requests.filter((request) => request.method === "PATCH");
      const lastSave = saves.at(-1).body;
      expect(lastSave.content[0]).toEqual({ type: "contract", contract: expect.objectContaining({ city: "La Paz", merchantParty: expect.objectContaining({ address: "Av. Arce 2345, La Paz" }) }) });
      expect(lastSave.content.slice(1).map((block) => block.title)).toEqual(["Objeto", "Precio y forma de pago", "Obligaciones de EL PRESTADOR", "Plazo", "Jurisdicción y ley aplicable"]);
      expect(JSON.stringify(lastSave)).not.toContain("confirmar monto");
      const flow = api.requests.filter((request) => request.method === "POST" && /\/(send|sign)$/.test(request.path)).map((request) => `${request.path.split("/").at(-1)}:${JSON.stringify(request.body)}`);
      expect(flow).toEqual(['send:{"email":false}', 'sign:{"version":1,"name":"Ana Quispe","method":"TYPED"}', 'send:{"email":true}']);
      expect(errors).toEqual([]);
    });

    test("list chips, signing progress and signing a contract the customer already signed", async ({ page }) => {
      const api = fakeApi([
        contract({ id: "con_a", numberLabel: "CON-0004", title: "Alquiler de sonido", signing: { customerSigned: true, customer: { name: "Luis Mamani", method: "TYPED", signedAt: inDays(-0.1) } }, content: [{ type: "contract", contract: meta({ contractType: "alquiler", signingOrder: "customer_first", merchantParty: { ...merchantParty, address: "Av. Arce 123" } }) }, ...AI_CLAUSES.slice(0, 2)] }),
        contract({ id: "con_b", numberLabel: "CON-0003", title: "Diseño de logo", status: "SIGNED", signing: { merchantSigned: true, customerSigned: true, merchant: { name: "Ana Quispe", signedAt: inDays(-3) }, customer: { name: "Café Illimani", signedAt: inDays(-2) } } }),
        contract({ id: "con_c", numberLabel: "CON-0002", title: "NDA con socio", status: "SENT", signing: { merchantSigned: true } }),
        contract({ id: "con_d", numberLabel: "CON-0001", title: "Venta de escritorios", status: "EXPIRED" }),
      ]);
      await openContracts(page, api);
      const list = page.locator(".proposals-list");
      await expect(list.locator("[data-contract-chip]")).toHaveText(["Firmado por el cliente", "Firmado", "Firmado por ti", "Vencido"]);
      await expect(page.locator(".contracts-summary")).toContainText("Te toca firmar");
      await shot(page, `dashboard-list-${width}`);

      await list.getByRole("button", { name: /Diseño de logo/ }).click();
      const sheet = page.locator("[data-contract-sheet]");
      await expect(sheet.locator("[data-contract-progress]")).toContainText("Firmado e inmutable");
      await expect(sheet.locator("[data-contract-pdf]")).toHaveAttribute("href", /\/documents\/public\/tok_con_b\/pdf\?download=1$/);
      await shot(page, `dashboard-signed-${width}`);
      await sheet.getByRole("button", { name: "Cerrar" }).click();

      await list.getByRole("button", { name: /Alquiler de sonido/ }).click();
      await expect(sheet.locator("[data-contract-progress] li.is-signed")).toContainText("Luis Mamani");
      await expect(sheet.getByRole("button", { name: "Editar" })).toHaveCount(0);
      await sheet.getByRole("button", { name: "Firmar ahora" }).click();
      await sheet.getByRole("tab", { name: "Dibujar" }).click();
      const canvas = sheet.locator("[data-contract-sign-canvas]");
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + 20, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 8 });
      await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20, { steps: 8 });
      await page.mouse.up();
      await sheet.getByRole("button", { name: /^Firmar$/ }).click();
      await expect(sheet.locator("[data-contract-chip]")).toHaveText("Firmado");
      const sign = api.requests.find((request) => request.path === "/stores/store_1/contracts/con_a/sign");
      expect(sign.body).toEqual(expect.objectContaining({ version: 1, method: "DRAWN", image: expect.stringMatching(/^data:image\/png;base64,/) }));
    });

    test("an accepted proposal becomes a contract in one tap, prefilled", async ({ page }) => {
      const proposal = {
        id: "pdoc_1", kind: "PROPOSAL", number: 7, numberLabel: "PRO-0007", status: "ACCEPTED", title: "Identidad visual", currency: "BOB",
        customer: { name: "Café Illimani", email: "compras@illimani.bo", phone: "70000001", document: null },
        items: [{ id: "i", description: "Logo", quantity: 1, unitAmount: 250000, amount: 250000, paymentLinkId: null }], subtotalAmount: 250000, discountAmount: 0, totalAmount: 250000,
        content: [{ type: "list", title: "Alcance", items: ["Logo", "Manual de marca"] }], validUntil: inDays(5), currentVersion: 1, publicUrl: "http://localhost:5175/d/tok_p", createdAt: inDays(-3),
        events: [{ id: "x", type: "accepted", version: 1, at: inDays(-1), data: { name: "Luis", email: "compras@illimani.bo", version: 1 } }],
      };
      const api = fakeApi([proposal]);
      await openContracts(page, api, "proposals");
      await page.locator("[data-proposal-card]").first().click();
      await page.getByRole("button", { name: "Crear contrato" }).click();
      await expect(page.locator("body")).toHaveAttribute("data-dashboard-view", "contracts");
      const sheet = page.locator("[data-contract-sheet]");
      await expect(sheet.locator("[data-contract-from-proposal]")).toContainText("PRO-0007");
      await expect(sheet.getByLabel("Objeto del contrato")).toHaveValue("Identidad visual: Logo; Manual de marca");
      await expect(sheet.getByLabel("Precio acordado")).toHaveValue("2.500,00");
      await expect(sheet.getByLabel("Nombre o razón social del cliente")).toHaveValue("Café Illimani");
      await sheet.getByRole("button", { name: "Redactar con IA" }).click();
      await expect(page.locator("[data-contract-editor]")).toBeVisible();
      const draft = api.requests.find((request) => request.path === "/stores/store_1/contracts/draft");
      expect(draft.body).toEqual(expect.objectContaining({ fromProposalId: "pdoc_1", priceAmount: 250000, customerEmail: "compras@illimani.bo" }));
    });

    test("without an AI key the composer offers the template", async ({ page }) => {
      const api = fakeApi([], { aiDown: true });
      await openContracts(page, api);
      await page.locator("[data-contract-new]").first().click();
      const sheet = page.locator("[data-contract-sheet]");
      await sheet.getByLabel("Objeto del contrato").fill("Mantenimiento mensual de jardín");
      await sheet.getByRole("button", { name: "Redactar con IA" }).click();
      await expect(sheet.locator("[data-contract-composer-error]")).toContainText("plantilla");
      await sheet.getByRole("button", { name: "Usar plantilla sin IA" }).click();
      await expect(page.locator("[data-contract-editor]")).toBeVisible();
      await expect(page.locator("[data-contract-ai-notice]")).toHaveCount(0);
      expect(api.requests.filter((request) => request.path === "/stores/store_1/contracts/draft").map((request) => request.body.ai)).toEqual([true, false]);
    });
  });
}
