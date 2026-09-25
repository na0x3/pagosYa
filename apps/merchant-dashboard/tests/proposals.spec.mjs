import { expect, test } from "@playwright/test";

// Documentos → Propuestas: describe the job, YAPI drafts it (mocked: no AI call ever
// leaves the test), edit, send, share; follow answers; turn an accepted one into a cobro.
const store = {
  id: "store_1", merchantId: "merchant_1", slug: "estudio", name: "Estudio Illimani", status: "ACTIVE",
  websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, heroSlides: [], contentOrder: [], editorialGallery: [],
  links: [], locations: [], animations: [], customDomains: [], checkoutMode: "payment", contactPhone: null, contactEmail: null,
};

const SHOTS = process.env.PROPOSALS_SHOTS_DIR;
const OPEN = ["SENT", "VIEWED", "CHANGES_REQUESTED"];
const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString();

const AI_BLOCKS = [
  { type: "paragraph", title: "Introducción", text: "Gracias por pensar en Estudio Illimani para la identidad de tu cafetería." },
  { type: "paragraph", title: "Entendimiento del problema", text: "La cafetería abre en noviembre y necesita una marca." },
  { type: "list", title: "Alcance", items: ["Investigación", "Tres propuestas de logo"] },
  { type: "list", title: "Entregables", items: ["Logo en PNG y SVG"] },
  { type: "list", title: "Cronograma", items: ["Semana 1 — Bocetos", "Semana 2 — Entrega final"] },
  { type: "paragraph", title: "Inversión", text: "Incluye dos rondas de cambios." },
  { type: "clause", title: "Condiciones de pago", text: "50% al aceptar y 50% al entregar." },
  { type: "clause", title: "Revisiones", text: "Dos rondas incluidas." },
  { type: "paragraph", title: "Próximo paso", text: "Acepta la propuesta en línea." },
];

function proposal(overrides = {}) {
  const id = overrides.id || "pdoc_9";
  return {
    id, kind: "PROPOSAL", number: 9, numberLabel: "PRO-0009", status: "VIEWED", title: "Catering para la empresa", currency: "BOB",
    customer: { name: "Ana Quispe", email: "ana@example.com", phone: "70000000", document: null },
    items: [{ id: "i1", description: "Catering 50 personas", quantity: 1, unitAmount: 500000, amount: 500000, paymentLinkId: null }],
    subtotalAmount: 500000, discountAmount: 0, totalAmount: 500000, content: AI_BLOCKS, dueAt: null, validUntil: inDays(8),
    currentVersion: 1, sentAt: inDays(-2), viewedAt: inDays(-1), voidedAt: null, paidAt: null, autoReminders: true,
    publicUrl: `http://localhost:5175/d/tok_${id}`, createdAt: inDays(-2),
    events: [{ id: "a", type: "created", at: inDays(-2) }, { id: "b", type: "sent", version: 1, at: inDays(-2) }, { id: "c", type: "viewed", version: 1, at: inDays(-1) }],
    ...overrides,
  };
}

function fakeApi(initial = [], { aiDown = false } = {}) {
  const documents = [...initial];
  const requests = [];
  let number = { PROPOSAL: documents.reduce((max, doc) => Math.max(max, doc.kind === "PROPOSAL" ? doc.number || 0 : 0), 0), INVOICE: 0 };
  const totals = (items, discount = 0) => {
    const priced = items.map((item, index) => ({ id: `item_${index}`, paymentLinkId: null, ...item, amount: item.quantity * item.unitAmount }));
    const subtotal = priced.reduce((sum, item) => sum + item.amount, 0);
    return { items: priced, subtotalAmount: subtotal, discountAmount: discount, totalAmount: subtotal - discount };
  };
  const detail = (doc) => ({ editTag: "tag0", ...doc, payment: { testMode: false, manual: false, afterClose: false, mismatch: false }, previewUrl: doc.publicUrl ? `${doc.publicUrl}?preview=prev` : null, versions: [], events: doc.events || [] });
  const expired = (doc) => doc.status === "EXPIRED" || doc.status === "VOIDED" || (OPEN.includes(doc.status) && doc.validUntil && new Date(doc.validUntil) < new Date());
  function create(body) {
    const doc = {
      id: `pdoc_${documents.length + 1}`, kind: body.kind, number: null, numberLabel: "Borrador", status: "DRAFT", title: body.title, currency: "BOB",
      customer: { name: body.customerName ?? null, email: body.customerEmail ?? null, phone: body.customerPhone ?? null, document: null },
      ...totals(body.items || []), content: body.content || [], dueAt: body.dueAt ?? null, validUntil: body.validUntil ?? null,
      currentVersion: 0, sentAt: null, viewedAt: null, voidedAt: null, paidAt: null, autoReminders: true, publicUrl: null,
      createdAt: new Date().toISOString(), events: [{ id: "e1", type: "created", at: new Date().toISOString() }],
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
    if (path === "/stores/store_1/payment_links") return json([
      { id: "pl_logo", name: "Diseño de logo", amount: 150000, currency: "BOB", status: "ACTIVE", imageUrls: [] },
      { id: "pl_usd", name: "Hosting anual", amount: 9000, currency: "USD", status: "ACTIVE", imageUrls: [] },
    ]);
    if (path === "/stores/store_1/cobros/summary") {
      const cobros = documents.filter((doc) => doc.kind === "INVOICE");
      return json({ testMode: false, merchantStatus: "ACTIVE", storeStatus: "ACTIVE", counts: { all: cobros.length, draft: 0, open: cobros.length, overdue: 0, paid: 0, voided: 0 }, totals: [], attention: [] });
    }
    if (path === "/stores/store_1/proposals/summary") {
      const rows = documents.filter((doc) => doc.kind === "PROPOSAL");
      const open = rows.filter((doc) => OPEN.includes(doc.status) && !expired(doc));
      const accepted = rows.filter((doc) => doc.status === "ACCEPTED");
      return json({
        counts: { all: rows.length, draft: rows.filter((doc) => doc.status === "DRAFT").length, open: open.length, changes: open.filter((doc) => doc.status === "CHANGES_REQUESTED").length, accepted: accepted.length, closed: rows.filter(expired).length },
        totals: rows.length ? [{ currency: "BOB", open: open.reduce((sum, doc) => sum + doc.totalAmount, 0), accepted30: accepted.reduce((sum, doc) => sum + doc.totalAmount, 0) }] : [],
      });
    }
    if (path === "/stores/store_1/proposals/draft") {
      if (aiDown) return json({ statusCode: 503, message: "La asistencia con IA no está configurada. Agrega OPENAI_API_KEY en el servidor." }, 503);
      const doc = create({
        kind: "PROPOSAL", title: "Identidad visual para tu cafetería", customerName: body.customerName, content: AI_BLOCKS, validUntil: inDays(15),
        items: [
          { description: "Diseño de logo", quantity: 1, unitAmount: 150000, paymentLinkId: "pl_logo" },
          { description: "Fotografía de producto {{precio}}", quantity: 1, unitAmount: 0 },
          { description: "Letrero {{confirmar precio}}", quantity: 1, unitAmount: 80000 },
        ],
      });
      doc.events.push({ id: "e2", type: "ai_drafted", at: new Date().toISOString(), data: { tone: body.tone } });
      return json({ ...doc, ai: { model: "gpt-5.6-luna" } });
    }
    if (path === "/stores/store_1/documents" && method === "GET") {
      const kind = url.searchParams.get("kind");
      const state = url.searchParams.get("state");
      const rows = documents.filter((doc) => doc.kind === kind && (!state
        || (state === "open" ? OPEN.includes(doc.status) && !expired(doc) : state === "accepted" ? doc.status === "ACCEPTED" : state === "draft" ? doc.status === "DRAFT" : expired(doc))));
      return json(rows.map(detail));
    }
    if (path === "/stores/store_1/documents" && method === "POST") return json(create(body));
    const match = /^\/stores\/store_1\/documents\/([^/]+)(?:\/(send|shared|void|regenerate-section|cobro))?$/.exec(path);
    if (match) {
      const doc = documents.find((row) => row.id === match[1]);
      if (!doc) return json({ message: "Documento no encontrado" }, 404);
      if (!match[2] && method === "GET") return json(detail(doc));
      if (!match[2] && method === "DELETE") { documents.splice(documents.indexOf(doc), 1); return json({ deleted: true }); }
      if (!match[2] && method === "PATCH") {
        if (["ACCEPTED", "EXPIRED", "VOIDED"].includes(doc.status)) return json({ statusCode: 409, message: "Este documento ya no se puede editar" }, 409);
        const ifMatch = request.headers()["if-match"];
        if (ifMatch && ifMatch.replace(/"/g, "") !== (doc.editTag || "tag0")) return json({ statusCode: 409, message: "Este documento cambió en otra pestaña o dispositivo." }, 409);
        doc.editTag = `tag${requests.length}`;
        if (body.title !== undefined) doc.title = body.title;
        if (body.customerName !== undefined) doc.customer = { ...doc.customer, name: body.customerName, email: body.customerEmail, phone: body.customerPhone };
        if (body.items) Object.assign(doc, totals(body.items));
        if (body.content) doc.content = body.content;
        if (body.validUntil) doc.validUntil = body.validUntil;
        return json(detail(doc));
      }
      if (match[2] === "regenerate-section") {
        return json({ block: { ...body.block, text: "Una introducción nueva, más breve y cálida." } });
      }
      if (match[2] === "send") {
        const pending = [...JSON.stringify(doc.content).matchAll(/\{\{[^{}]+\}\}/g), ...doc.items.flatMap((item) => [...item.description.matchAll(/\{\{[^{}]+\}\}/g)])];
        if (pending.length) return json({ message: `Completa los datos pendientes antes de enviar: ${pending.join(", ")}` }, 422);
        if (!doc.number) { number[doc.kind] += 1; doc.number = number[doc.kind]; doc.numberLabel = `${doc.kind === "PROPOSAL" ? "PRO" : "COB"}-${String(doc.number).padStart(4, "0")}`; }
        doc.status = "SENT"; doc.currentVersion += 1; doc.sentAt = new Date().toISOString();
        doc.publicUrl = `http://localhost:5175/d/tok_${doc.id}`;
        doc.events.push({ id: `e${doc.events.length + 1}`, type: "sent", version: doc.currentVersion, at: new Date().toISOString() });
        return json({ document: detail(doc), publicUrl: doc.publicUrl, emailed: body?.email !== false && Boolean(doc.customer.email) });
      }
      if (match[2] === "shared") return json({ shared: true });
      if (match[2] === "void") { doc.status = "VOIDED"; return json(detail(doc)); }
      if (match[2] === "cobro") {
        const cobro = create({ kind: "INVOICE", title: doc.title, customerName: doc.customer.name, customerEmail: doc.customer.email, customerPhone: doc.customer.phone, items: doc.items.map(({ description, quantity, unitAmount }) => ({ description, quantity, unitAmount })), dueAt: inDays(7) });
        cobro.id = "cdoc_from_proposal";
        number.INVOICE += 1;
        Object.assign(cobro, { number: number.INVOICE, numberLabel: "COB-0001", status: "SENT", currentVersion: 1, publicUrl: "http://localhost:5175/d/tok_cobro" });
        doc.events.push({ id: "cc", type: "cobro_created", at: new Date().toISOString(), data: { cobroId: cobro.id } });
        return json({ cobro: detail(cobro), created: true, publicUrl: cobro.publicUrl });
      }
    }
    return json([]);
  }
  return { documents, requests, handle };
}

async function openProposals(page, api) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:5175/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><main>Propuesta</main>" }));
  await page.route("http://localhost:3001/v1/**", api.handle);
  await page.goto("/#dashboard-proposals");
  await expect(page.locator("body")).toHaveAttribute("data-dashboard-view", "proposals");
}

for (const width of [390, 1280]) {
  test.describe(`proposals at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test("first proposal: an example prompt, an AI draft, fix the missing price, edit, regenerate, send and share", async ({ page }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const api = fakeApi();
      await openProposals(page, api);

      // The empty state teaches: three steps and three example prompts.
      const empty = page.locator("[data-proposals-empty]");
      await expect(empty).toContainText("Propuestas profesionales en segundos");
      await expect(empty.locator("[data-proposal-example]")).toHaveCount(3);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-empty-${width}.png` });
      await empty.getByRole("button", { name: /Logo para una cafetería/ }).click();

      const sheet = page.locator("[data-proposal-sheet]");
      const brief = sheet.getByLabel("Describe el trabajo");
      await expect(brief).toHaveValue(/cafetería/);
      await sheet.getByText("Más detalles (opcional)").click();
      await sheet.getByLabel("Nombre del cliente").fill("Café Aroma");
      await sheet.getByRole("radio", { name: "Cercano" }).check();
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-compose-${width}.png` });
      await sheet.getByRole("button", { name: "Crear borrador con IA" }).click();

      // The draft opens in the editor, with the AI notice and the missing price called out.
      const editor = page.locator("[data-proposal-editor]");
      await expect(editor).toBeVisible();
      await expect(editor.locator("[data-proposal-ai-notice]")).toContainText("Borrador generado con IA — revísalo");
      const draftPost = api.requests.find((request) => request.path === "/stores/store_1/proposals/draft");
      expect(draftPost.body).toEqual(expect.objectContaining({ brief: expect.stringMatching(/cafetería/), customerName: "Café Aroma", tone: "cercano" }));
      await expect(editor.locator("[data-proposal-pending]")).toContainText("Precio de «Fotografía de producto»");
      const send = page.getByRole("button", { name: "Enviar propuesta" });
      await expect(send).toBeDisabled();
      await expect(editor.locator("[data-proposal-block]")).toHaveCount(9);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-draft-${width}.png` });
      if (SHOTS) { await editor.getByLabel("Precio de la línea 2").scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOTS}/dashboard-items-${width}.png` }); }

      // A price read from the merchant's words is shown, flagged, and waits for a confirm tap.
      await expect(editor.locator("[data-proposal-pending]")).toContainText("Confirma el precio de «Letrero»");
      const letrero = editor.locator('[data-proposal-line="2"]');
      await expect(letrero.locator("[data-proposal-line-flag]")).toContainText("Precio tomado de tu descripción — confírmalo");
      await expect(letrero.getByLabel("Precio de la línea 3", { exact: true })).toHaveValue("800,00");

      // Typing the missing price clears it; the total follows; the send still waits for the confirmation.
      await editor.getByLabel("Precio de la línea 2").fill("200");
      await expect(page.locator("[data-proposal-total]")).toHaveText("Bs 2.500,00");
      await expect(editor.locator("[data-proposal-pending]")).not.toContainText("Fotografía");
      await expect(send).toBeDisabled();
      if (SHOTS) { await letrero.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${SHOTS}/dashboard-confirm-${width}.png` }); }
      await letrero.getByRole("button", { name: "Confirmar precio de la línea 3" }).click();
      await expect(letrero.locator("[data-proposal-line-flag]")).toHaveCount(0);
      await expect(editor.locator("[data-proposal-pending]")).toBeHidden();
      await expect(send).toBeEnabled();

      // Edit a block, regenerate it with AI, move one down.
      const intro = editor.locator("[data-proposal-block]").first();
      await intro.getByLabel("Texto de «Introducción»").fill("Hola, gracias por escribirnos.");
      await intro.getByRole("button", { name: "Regenerar con IA" }).click();
      await expect(intro.getByLabel("Texto de «Introducción»")).toHaveValue("Una introducción nueva, más breve y cálida.");
      await intro.getByRole("button", { name: "Bajar sección" }).click();
      await expect(editor.locator("[data-proposal-block]").nth(1).getByLabel("Título de la sección 2")).toHaveValue("Introducción");
      await expect(page.locator("[data-proposal-save-state]")).toHaveText("Guardado");
      const patch = api.requests.filter((request) => request.method === "PATCH").pop();
      expect(patch.body.items[1]).toEqual({ description: "Fotografía de producto", quantity: 1, unitAmount: 20000 });
      expect(patch.body.items[2]).toEqual({ description: "Letrero", quantity: 1, unitAmount: 80000 });
      expect(patch.body.content[1]).toEqual({ type: "paragraph", title: "Introducción", text: "Una introducción nueva, más breve y cálida." });
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-edit-${width}.png` });

      await send.click();
      await expect(sheet.locator("#proposalSheetTitle")).toHaveText("¡Propuesta PRO-0001 lista!");
      const whatsapp = sheet.locator('[data-proposal-share-action="whatsapp"]');
      await expect(whatsapp).toHaveAttribute("href", /wa\.me\/\?text=.*propuesta%20PRO-0001/);
      await expect(sheet.locator("[data-proposal-preview-link]")).toHaveAttribute("href", /preview=prev/);
      if (SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/dashboard-share-${width}.png` }); }
      await sheet.getByRole("button", { name: "Listo" }).click();

      const card = page.locator("[data-proposal-card]").first();
      await expect(card).toContainText("Identidad visual para tu cafetería");
      await expect(card).toContainText("Enviada");
      expect(errors).toEqual([]);
    });

    test("the list shows every status; changes requested and accepted lead to their next step; Crear cobro opens the cobro", async ({ page }) => {
      const api = fakeApi([
        proposal({ id: "pdoc_acc", number: 4, numberLabel: "PRO-0004", status: "ACCEPTED", title: "Mantenimiento de jardín", events: [
          { id: "a", type: "created", at: inDays(-3) }, { id: "b", type: "sent", version: 1, at: inDays(-3) },
          { id: "c", type: "accepted", version: 1, at: inDays(-1), data: { name: "Ana Quispe", email: "ana@example.com", version: 1, sha256: "f".repeat(64) } },
        ] }),
        proposal({ id: "pdoc_chg", number: 3, numberLabel: "PRO-0003", status: "CHANGES_REQUESTED", title: "Catering 50 personas", events: [
          { id: "a", type: "sent", version: 1, at: inDays(-2) },
          { id: "c", type: "changes_requested", version: 1, at: inDays(-1), data: { name: "Beto", email: "beto@example.com", message: "¿Pueden sumar postres?" } },
        ] }),
        proposal({ id: "pdoc_exp", number: 2, numberLabel: "PRO-0002", status: "EXPIRED", title: "Diseño web", validUntil: inDays(-3) }),
        proposal({ id: "pdoc_draft", number: null, numberLabel: "Borrador", status: "DRAFT", title: "Letrero", currentVersion: 0, publicUrl: null }),
        proposal({ id: "pdoc_view", number: 1, numberLabel: "PRO-0001", status: "VIEWED", title: "Fotos de producto" }),
      ]);
      await openProposals(page, api);
      const list = page.locator("[data-proposal-card]");
      await expect(list).toHaveCount(5);
      for (const chip of ["Aceptada", "Cambios pedidos", "Vencida", "Borrador", "Vista"]) await expect(page.locator(".proposal-chip", { hasText: chip }).first()).toBeVisible();
      await expect(page.locator('[data-proposal-filter="accepted"]')).toContainText("1");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-list-${width}.png` });

      await page.locator('[data-proposal-filter="closed"]').click();
      await expect(list).toHaveCount(1);
      await page.locator('[data-proposal-filter="all"]').click();
      await expect(list).toHaveCount(5);

      await list.filter({ hasText: "Catering 50 personas" }).click();
      const sheet = page.locator("[data-proposal-sheet]");
      await expect(sheet.locator("[data-proposal-changes-note]")).toContainText("¿Pueden sumar postres?");
      await expect(sheet.getByRole("button", { name: "Editar y reenviar" })).toBeVisible();
      await sheet.getByRole("button", { name: "Cerrar" }).click();

      await list.filter({ hasText: "Mantenimiento de jardín" }).click();
      await expect(sheet.locator("[data-proposal-accepted-note]")).toContainText("Aceptada por Ana Quispe");
      if (SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/dashboard-accepted-${width}.png` }); }
      await sheet.getByRole("button", { name: "Crear cobro" }).click();
      await expect(page.locator("body")).toHaveAttribute("data-dashboard-view", "cobros");
      await expect(page.locator("[data-cobro-sheet] #cobroSheetTitle")).toHaveText("¡Cobro COB-0001 listo!");
      expect(api.requests.some((request) => request.method === "POST" && request.path === "/stores/store_1/documents/pdoc_acc/cobro")).toBe(true);
    });

    test("an edit that lands after the customer accepted reloads the accepted proposal and says which version counts", async ({ page }) => {
      const api = fakeApi([proposal({ id: "pdoc_view", title: "Fotos de producto" })]);
      await openProposals(page, api);
      await page.locator("[data-proposal-card]").first().click();
      const sheet = page.locator("[data-proposal-sheet]");
      await sheet.getByRole("button", { name: "Editar" }).click();
      const editor = page.locator("[data-proposal-editor]");
      await expect(editor).toBeVisible();
      // Meanwhile the customer accepts version 1.
      const doc = api.documents.find((row) => row.id === "pdoc_view");
      doc.status = "ACCEPTED";
      doc.events = [...doc.events, { id: "acc", type: "accepted", version: 1, at: new Date().toISOString(), data: { name: "Ana Quispe", email: "ana@example.com", version: 1 } }];
      await page.locator("#proposalTitle").fill("Fotos de producto y video");
      await expect(sheet.locator("[data-proposal-conflict]")).toContainText("Tu cliente aceptó la versión 1");
      await expect(sheet.locator("[data-proposal-accepted-note]")).toContainText("Aceptada por Ana Quispe");
      await expect(editor).toHaveCount(0);
    });

    test("on a sent proposal a new validity waits for 'Enviar versión nueva', and past dates cannot be picked", async ({ page }) => {
      const api = fakeApi([proposal({ id: "pdoc_view", title: "Fotos de producto" })]);
      await openProposals(page, api);
      await page.locator("[data-proposal-card]").first().click();
      const sheet = page.locator("[data-proposal-sheet]");
      await sheet.getByRole("button", { name: "Editar" }).click();
      const editor = page.locator("[data-proposal-editor]");
      const today = new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);
      await expect(editor.locator("#proposalValidDate")).toHaveAttribute("min", today);
      await editor.getByRole("radio", { name: "30 días" }).check();
      await expect(editor.locator("[data-proposal-valid-hint]")).toContainText("al enviar la versión nueva");
      await editor.getByLabel("Texto de «Introducción»").fill("Hola de nuevo.");
      await expect(page.locator("[data-proposal-save-state]")).toHaveText("Guardado");
      const autosaves = api.requests.filter((request) => request.method === "PATCH");
      expect(autosaves.length).toBeGreaterThan(0);
      expect(autosaves.every((request) => !("validUntil" in request.body))).toBe(true);
      await page.getByRole("button", { name: "Enviar versión nueva" }).click();
      await expect(sheet.locator("#proposalSheetTitle")).toContainText("PRO-0009");
      const beforeSend = api.requests.filter((request) => request.method === "PATCH").pop();
      expect(new Date(beforeSend.body.validUntil).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    });

    test("'Ver el cobro' makes a fresh cobro when the linked draft was deleted", async ({ page }) => {
      const api = fakeApi([proposal({ id: "pdoc_acc", number: 4, numberLabel: "PRO-0004", status: "ACCEPTED", title: "Mantenimiento de jardín", events: [
        { id: "b", type: "sent", version: 1, at: inDays(-3) },
        { id: "c", type: "accepted", version: 1, at: inDays(-2), data: { name: "Ana Quispe", email: "ana@example.com", version: 1 } },
        { id: "d", type: "cobro_created", at: inDays(-1), data: { cobroId: "cdoc_deleted" } },
      ] })]);
      await openProposals(page, api);
      await page.locator("[data-proposal-card]").first().click();
      await page.locator("[data-proposal-sheet]").getByRole("button", { name: "Ver el cobro" }).click();
      await expect(page.locator("body")).toHaveAttribute("data-dashboard-view", "cobros");
      await expect(page.locator("[data-cobro-sheet] #cobroSheetTitle")).toHaveText("¡Cobro COB-0001 listo!");
      expect(api.requests.some((request) => request.method === "POST" && request.path === "/stores/store_1/documents/pdoc_acc/cobro")).toBe(true);
    });

    test("a save from a second tab that is behind is refused and the editor reloads what was saved", async ({ page }) => {
      const api = fakeApi([proposal({ id: "pdoc_view", title: "Fotos de producto" })]);
      await openProposals(page, api);
      await page.locator("[data-proposal-card]").first().click();
      const sheet = page.locator("[data-proposal-sheet]");
      await sheet.getByRole("button", { name: "Editar" }).click();
      await page.locator("#proposalTitle").fill("Fotos de producto 2026");
      await expect(page.locator("[data-proposal-save-state]")).toHaveText("Guardado");
      const first = api.requests.filter((request) => request.method === "PATCH").pop();
      expect(first.headers["if-match"]).toBe('"tag0"');
      // Another tab saves meanwhile.
      const doc = api.documents.find((row) => row.id === "pdoc_view");
      Object.assign(doc, { editTag: "other-tab", title: "Fotos y video (otra pestaña)" });
      await page.locator("#proposalTitle").fill("Fotos de producto 2027");
      await expect(sheet.locator("[data-proposal-conflict]")).toContainText("cambió en otra pestaña");
      await expect(sheet.locator("#proposalSheetTitle")).toHaveText("Fotos y video (otra pestaña)");
      await expect(page.locator("[data-proposal-editor]")).toHaveCount(0);
    });

    test("the catalog picker only adds products in the proposal's currency", async ({ page }) => {
      const api = fakeApi([proposal({ id: "pdoc_draft", number: null, numberLabel: "Borrador", status: "DRAFT", title: "Página web", currentVersion: 0, publicUrl: null, items: [] })]);
      await openProposals(page, api);
      await page.locator("[data-proposal-card]").first().click();
      const sheet = page.locator("[data-proposal-sheet]");
      await sheet.getByRole("button", { name: "Seguir editando" }).click();
      const editor = page.locator("[data-proposal-editor]");
      await editor.getByRole("button", { name: "Desde tu catálogo" }).click();
      const usd = editor.locator('[data-proposal-product="pl_usd"]');
      await expect(usd).toBeDisabled();
      await expect(usd).toContainText("Otra moneda");
      await editor.locator('[data-proposal-product="pl_logo"]').click();
      await expect(editor.getByLabel("Descripción de la línea 1")).toHaveValue("Diseño de logo");
      await expect(editor.locator("[data-proposal-line]")).toHaveCount(1);
    });

    test("without AI (no key on the server) the merchant can still start from the template", async ({ page }) => {
      const api = fakeApi([], { aiDown: true });
      await openProposals(page, api);
      await page.locator("[data-proposals-empty]").getByRole("button", { name: "Crear mi primera propuesta" }).click();
      const sheet = page.locator("[data-proposal-sheet]");
      await sheet.getByLabel("Describe el trabajo").fill("Instalación eléctrica de una oficina de 80 m²");
      await sheet.getByRole("button", { name: "Crear borrador con IA" }).click();
      await expect(sheet.locator("[data-proposal-composer-error]")).toContainText("no está configurada");
      await sheet.getByRole("button", { name: "Empezar sin IA" }).click();
      const editor = page.locator("[data-proposal-editor]");
      await expect(editor.locator("[data-proposal-block]")).toHaveCount(9);
      await expect(editor.locator("[data-proposal-ai-notice]")).toHaveCount(0);
      const created = api.requests.find((request) => request.method === "POST" && request.path === "/stores/store_1/documents");
      expect(created.body).toEqual(expect.objectContaining({ kind: "PROPOSAL", title: "Instalación eléctrica de una oficina de 80 m²" }));
    });
  });
}
