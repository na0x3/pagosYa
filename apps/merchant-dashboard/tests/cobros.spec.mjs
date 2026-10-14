import { expect, test } from "@playwright/test";

// Documentos → Cobros: create a cobro, share it, and follow it. The API is mocked
// with a tiny in-memory store so create → send → list → summary reads back what was posted.
const store = {
  id: "store_1", merchantId: "merchant_1", slug: "estudio", name: "Estudio Illimani", status: "ACTIVE",
  websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, heroSlides: [], contentOrder: [], editorialGallery: [],
  links: [], locations: [], animations: [], customDomains: [], checkoutMode: "payment", contactPhone: null, contactEmail: null,
};

const SHOTS = process.env.COBROS_SHOTS_DIR;
const OPEN = ["SENT", "VIEWED", "OVERDUE"];

/** A sent cobro as the API lists it. */
function seeded(overrides = {}) {
  const id = overrides.id || "cdoc_9";
  return {
    id, kind: "INVOICE", number: 9, numberLabel: "COB-0009", status: "VIEWED", title: "Diseño", currency: "BOB",
    customer: { name: "Ana Quispe", email: "ana@example.com", phone: "70000000", document: null },
    items: [{ id: "i1", description: "Diseño", quantity: 1, unitAmount: 50000, amount: 50000, paymentLinkId: null }],
    subtotalAmount: 50000, discountAmount: 0, totalAmount: 50000, content: [], dueAt: "2099-01-01T03:59:59.000Z",
    currentVersion: 1, sentAt: "2026-09-20T10:00:00Z", viewedAt: "2026-09-21T10:00:00Z", voidedAt: null, paidAt: null, autoReminders: true,
    publicUrl: `http://localhost:5175/d/tok_${id}`, createdAt: "2026-09-20T10:00:00Z",
    payment: { testMode: false, manual: false, afterClose: false, mismatch: false },
    events: [
      { id: "a", type: "created", at: "2026-09-20T10:00:00Z" },
      { id: "b", type: "sent", version: 1, at: "2026-09-20T10:00:01Z", data: {} },
      { id: "c", type: "viewed", version: 1, at: "2026-09-21T10:00:00Z" },
    ],
    ...overrides,
  };
}

function fakeApi(initial = [], { merchantStatus = "ACTIVE", failSend = 0 } = {}) {
  const documents = [...initial];
  const requests = [];
  const failures = { send: failSend };
  let number = documents.reduce((max, doc) => Math.max(max, doc.number || 0), 0);
  const noPayment = { testMode: false, manual: false, afterClose: false, mismatch: false };
  const detail = (doc) => ({
    ...doc,
    payment: doc.payment || noPayment,
    previewUrl: doc.publicUrl ? `${doc.publicUrl}?preview=prev` : null,
    versions: [],
    events: doc.events || [],
  });
  const overdue = (doc) => doc.status === "OVERDUE" || (OPEN.includes(doc.status) && doc.dueAt && new Date(doc.dueAt) < new Date());
  function summary() {
    const sum = (rows) => rows.reduce((total, doc) => total + doc.totalAmount, 0);
    const paid = documents.filter((doc) => doc.status === "PAID");
    const attention = documents.filter((doc) => doc.payment?.afterClose || doc.payment?.mismatch);
    return {
      testMode: merchantStatus !== "ACTIVE",
      merchantStatus,
      storeStatus: "ACTIVE",
      counts: {
        all: documents.length,
        draft: documents.filter((doc) => doc.status === "DRAFT").length,
        open: documents.filter((doc) => OPEN.includes(doc.status)).length,
        overdue: documents.filter(overdue).length,
        paid: paid.length,
        voided: documents.filter((doc) => doc.status === "VOIDED").length,
      },
      totals: documents.length ? [{
        currency: "BOB",
        owed: sum(documents.filter((doc) => OPEN.includes(doc.status))),
        overdue: sum(documents.filter(overdue)),
        collected: sum(paid.filter((doc) => !doc.payment?.testMode)),
        testCollected: sum(paid.filter((doc) => doc.payment?.testMode)),
      }] : [],
      attention: attention.map((doc) => ({ documentId: doc.id, numberLabel: doc.numberLabel, type: doc.payment.afterClose ? "payment_after_close" : "payment_mismatch", statusBefore: doc.status, amount: doc.totalAmount, currency: "BOB", at: new Date().toISOString() })),
    };
  }
  async function handle(route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/v1", "");
    const method = request.method();
    const body = request.postData() ? request.postDataJSON() : undefined;
    requests.push({ method, path, body, query: url.search });
    const json = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path === "/stores") return json([store]);
    if (path === "/merchants/balance") return json({ payableBalance: 0 });
    if (path === "/merchants/kyc") return json({ status: "APPROVED" });
    if (path === "/merchants/invoicing_profile") return json({ status: "CONFIGURED", cuis: "CUIS-1" });
    if (path === "/merchants/finances") return json({ totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" });
    if (path === "/stores/store_1/cobros/summary") return json(summary());
    if (path === "/stores/store_1/document-customers") {
      const all = [
        { businessCustomerId: "cust_1", name: "Ana Quispe", email: "ana@example.com", phone: "70000000", document: "4567890", source: "crm" },
        { businessCustomerId: null, name: "Beto Mamani", email: null, phone: "71111111", document: null, source: "buyer" },
      ];
      const q = (url.searchParams.get("q") || "").toLowerCase();
      return json(all.filter((row) => !q || row.name.toLowerCase().includes(q)));
    }
    if (path === "/stores/store_1/payment_links") return json([
      { id: "pl_logo", name: "Diseño de logo", amount: 150000, currency: "BOB", status: "ACTIVE", imageUrls: [] },
      { id: "pl_card", name: "Tarjetas", amount: 35000, currency: "BOB", status: "ACTIVE", imageUrls: [] },
    ]);
    if (path === "/stores/store_1/documents" && method === "GET") {
      const state = url.searchParams.get("state");
      const limit = Number(url.searchParams.get("limit") || 100);
      const cursor = url.searchParams.get("cursor");
      let rows = documents.filter((doc) => !state || (state === "open" ? OPEN.includes(doc.status) : state === "overdue" ? overdue(doc) : doc.status === "PAID"));
      if (cursor) rows = rows.slice(rows.findIndex((doc) => doc.id === cursor) + 1);
      return json(rows.slice(0, limit).map((doc) => ({ ...doc, payment: doc.payment || noPayment })));
    }
    if (path === "/stores/store_1/documents" && method === "POST") {
      const items = body.items.map((item, index) => ({ id: `item_${index}`, ...item, amount: item.quantity * item.unitAmount, paymentLinkId: item.paymentLinkId ?? null }));
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      const doc = {
        id: `cdoc_${documents.length + 1}`, kind: "INVOICE", number: null, numberLabel: "Borrador", status: "DRAFT", title: body.title, currency: "BOB",
        customer: { name: body.customerName, email: body.customerEmail || null, phone: body.customerPhone || null, document: body.customerDocument || null },
        items, subtotalAmount: total, discountAmount: 0, totalAmount: total, content: body.content, dueAt: body.dueAt ?? null,
        currentVersion: 0, sentAt: null, viewedAt: null, voidedAt: null, paidAt: null, autoReminders: body.autoReminders, publicUrl: null,
        createdAt: new Date().toISOString(), events: [{ id: "e1", type: "created", at: new Date().toISOString() }],
      };
      documents.unshift(doc);
      return json(doc);
    }
    const match = /^\/stores\/store_1\/documents\/([^/]+)(?:\/(send|remind|shared|void|mark-paid|reminders))?$/.exec(path);
    if (match) {
      const doc = documents.find((row) => row.id === match[1]);
      if (!doc) return json({ message: "Documento no encontrado" }, 404);
      if (!match[2] && method === "GET") return json(detail(doc));
      if (!match[2] && method === "PATCH") {
        if (body.customerEmail !== undefined) doc.customer.email = body.customerEmail;
        if (body.customerName !== undefined) doc.customer.name = body.customerName;
        return json(detail(doc));
      }
      if (match[2] === "send") {
        if (failures.send > 0) { failures.send -= 1; return json({ message: "Se cortó la conexión. Intenta de nuevo." }, 503); }
        if (!doc.number) { number += 1; doc.number = number; doc.numberLabel = `COB-${String(number).padStart(4, "0")}`; }
        doc.status = "SENT"; doc.currentVersion = 1; doc.sentAt = new Date().toISOString();
        doc.publicUrl = `http://localhost:5175/d/tok_${doc.id}`;
        doc.events.push({ id: `e${doc.events.length + 1}`, type: "sent", version: 1, at: new Date().toISOString(), data: {} });
        return json({ document: doc, publicUrl: doc.publicUrl, emailed: body?.email !== false && Boolean(doc.customer.email) });
      }
      if (match[2] === "remind") return json({ emailed: body.channel === "email" });
      if (match[2] === "shared") return json({ shared: true });
      if (match[2] === "void") { doc.status = "VOIDED"; return json(detail(doc)); }
      if (match[2] === "mark-paid") {
        doc.status = "PAID"; doc.paidAt = new Date().toISOString(); doc.payment = { ...noPayment, manual: true };
        doc.events.push({ id: `e${doc.events.length + 1}`, type: "paid_manually", version: 1, at: new Date().toISOString(), data: body });
        return json(detail(doc));
      }
      if (match[2] === "reminders") { doc.autoReminders = body.autoReminders; return json(detail(doc)); }
    }
    return json([]);
  }
  return { documents, requests, handle };
}

async function openCobros(page, api) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:5175/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><main>Tienda</main>" }));
  await page.route("http://localhost:3001/v1/**", api.handle);
  await page.goto("/#dashboard-cobros");
  await expect(page.locator("body")).toHaveAttribute("data-dashboard-view", "cobros");
}

const createPosts = (api) => api.requests.filter((request) => request.method === "POST" && request.path === "/stores/store_1/documents");

for (const width of [390, 1280]) {
  test.describe(`cobros at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test("first cobro: guided create, share by WhatsApp, and it shows up as Por cobrar", async ({ page }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const api = fakeApi();
      await openCobros(page, api);

      // First run teaches in one sentence and one button.
      const empty = page.locator("[data-cobros-empty]");
      await expect(empty).toContainText("Crea un cobro, compártelo por WhatsApp y recibe el pago con QR o tarjeta.");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-empty-${width}.png` });
      await empty.getByRole("button", { name: "Crear mi primer cobro" }).click();

      const sheet = page.locator("[data-cobro-sheet]");
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText("la factura SIN se emite sola");
      // 1. Customer: Enter alone never picks a suggestion; arrows choose, Enter confirms.
      const name = sheet.getByLabel("Nombre del cliente");
      await name.fill("an");
      await expect(sheet.getByRole("option", { name: /Ana Quispe/ })).toBeVisible();
      await name.press("Enter");
      await expect(name).toHaveValue("an");
      await expect(sheet.getByLabel("WhatsApp del cliente")).toHaveValue("");
      await name.press("ArrowDown");
      await expect(sheet.getByRole("option", { name: /Ana Quispe/ })).toHaveAttribute("aria-selected", "true");
      await expect(name).toHaveAttribute("aria-activedescendant", "cobroSuggestion0");
      await name.press("Enter");
      await expect(name).toHaveValue("Ana Quispe");
      await expect(sheet.getByLabel("WhatsApp del cliente")).toHaveValue("70000000");
      await expect(sheet.getByLabel("Correo del cliente")).toHaveValue("ana@example.com");
      await expect(sheet.getByLabel(/NIT o CI/)).toHaveValue("4567890");
      // Clearing the email really clears it (no silent fallback to the CRM row).
      await sheet.getByLabel("Correo del cliente").fill("");
      // 2. A catalog product and a free line.
      await sheet.getByRole("button", { name: "Desde tu catálogo" }).click();
      await sheet.getByRole("button", { name: /Diseño de logo/ }).click();
      await sheet.getByRole("button", { name: "Agregar otra línea" }).click();
      // A price without a description is an inline error, and the total never counts it.
      await sheet.getByLabel("Precio de la línea 2").fill("25,50");
      await sheet.getByLabel("Precio de la línea 2").press("Enter"); // Enter never submits
      await expect(sheet.locator("[data-cobro-total]")).toHaveText("Bs 1.500,00");
      await sheet.getByRole("button", { name: "Crear cobro" }).click();
      await expect(sheet.locator("[data-cobro-line-error]")).toHaveText("Falta la descripción de esta línea.");
      await expect(sheet.getByLabel("Descripción de la línea 2")).toHaveAttribute("aria-invalid", "true");
      expect(createPosts(api)).toHaveLength(0);
      await sheet.getByLabel("Descripción de la línea 2").fill("Envío");
      await expect(sheet.locator("[data-cobro-line-error]")).toHaveCount(0);
      await expect(sheet.locator("[data-cobro-total]")).toHaveText("Bs 1.525,50");
      // 3. A past "Otra fecha" is refused; a preset works.
      await sheet.getByRole("radio", { name: "Otra fecha" }).check();
      await sheet.getByLabel("Fecha de vencimiento").fill("2020-01-10");
      await expect(sheet.locator("[data-cobro-due-hint]")).toContainText("Esa fecha ya pasó");
      await sheet.getByRole("button", { name: "Crear cobro" }).click();
      await expect(sheet.locator("[data-cobro-problems]")).toContainText("La fecha de vencimiento ya pasó");
      expect(createPosts(api)).toHaveLength(0);
      await sheet.getByRole("radio", { name: "15 días" }).check();
      await expect(sheet.locator("[data-cobro-due-hint]")).toContainText("Vence el");
      await expect(sheet.locator("[data-cobro-problems]")).toBeHidden(); // the fixed problem goes away
      if (SHOTS) await sheet.screenshot({ path: `${SHOTS}/dashboard-create-${width}.png` });
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-create-page-${width}.png` });
      await sheet.getByRole("button", { name: "Crear cobro" }).click();

      // Share sheet: real links, so no popup blocker gets in the way.
      await expect(sheet).toContainText("¡Cobro COB-0001 listo!");
      const whatsapp = sheet.getByRole("link", { name: /WhatsApp/ });
      await expect(whatsapp).toHaveAttribute("href", /^https:\/\/wa\.me\/59170000000\?text=Hola%20Ana%2C%20te%20comparto%20el%20cobro%20COB-0001/);
      await expect(whatsapp).toHaveAttribute("href", /localhost%3A5175%2Fd%2Ftok_cdoc_1/);
      await expect(sheet.getByRole("button", { name: /Copiar enlace/ })).toBeVisible();
      // "Ver como cliente" opens only the signed preview (never a counted view of the plain link).
      await expect(sheet.locator("[data-cobro-preview-link]")).toHaveAttribute("href", "http://localhost:5175/d/tok_cdoc_1?preview=prev");
      await expect(sheet.locator("[data-cobro-preview-link]")).not.toHaveAttribute("aria-disabled", "true");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-share-${width}.png` });

      expect(createPosts(api)).toHaveLength(1);
      const create = createPosts(api)[0];
      expect(create.body).toEqual(expect.objectContaining({
        kind: "INVOICE",
        title: "Diseño de logo y 1 más",
        businessCustomerId: "cust_1",
        customerName: "Ana Quispe",
        customerEmail: null,
        customerPhone: "70000000",
        customerDocument: "4567890",
        items: [
          { description: "Diseño de logo", quantity: 1, unitAmount: 150000, paymentLinkId: "pl_logo" },
          { description: "Envío", quantity: 1, unitAmount: 2550 },
        ],
        autoReminders: true,
      }));
      expect(create.body.dueAt).toMatch(/T03:59:59\.000Z$/);
      expect(api.requests.find((request) => request.path.endsWith("/send")).body).toEqual({ email: false });

      await sheet.getByRole("button", { name: "Listo" }).click();
      await expect(sheet).toBeHidden();
      const card = page.locator("[data-cobro-card]").first();
      await expect(card).toContainText("Ana Quispe");
      await expect(card).toContainText("Por cobrar");
      await expect(card).toContainText("Bs 1.525,50");
      await expect(page.getByRole("tab", { name: /Por cobrar/ })).toContainText("1");
      await expect(page.locator(".cobros-summary")).toContainText("Bs 1.525,50");
      if (width >= 1000) {
        // The filter tabs are a compact track, not a grey bar across the page.
        const track = await page.getByRole("tablist", { name: "Filtrar cobros" }).boundingBox();
        const list = await page.locator(".cobros-summary").boundingBox();
        expect(track.width).toBeLessThan(list.width);
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-list-${width}.png` });
      expect(errors).toEqual([]);
    });

    test("a retry after the send failed reuses the draft it already created", async ({ page }) => {
      const api = fakeApi([], { failSend: 1 });
      await openCobros(page, api);
      await page.getByRole("button", { name: "Crear mi primer cobro" }).click();
      const sheet = page.locator("[data-cobro-sheet]");
      await sheet.getByLabel("Nombre del cliente").fill("Beto Mamani");
      await sheet.getByLabel("Descripción de la línea 1").fill("Clases de guitarra");
      await sheet.getByLabel("Precio de la línea 1").fill("200");
      await sheet.getByRole("button", { name: "Crear cobro" }).click();
      await expect(sheet.locator("[data-cobro-problems]")).toContainText("quedó guardado como borrador");
      await sheet.getByRole("button", { name: "Crear cobro" }).click();
      await expect(sheet).toContainText("¡Cobro COB-0001 listo!");
      expect(createPosts(api)).toHaveLength(1);
      expect(api.requests.filter((request) => request.method === "PATCH")).toHaveLength(1);
      expect(api.requests.filter((request) => request.path.endsWith("/send"))).toHaveLength(2);
    });

    test("closing a filled-in cobro asks first, and Tab never leaves the sheet", async ({ page }) => {
      const api = fakeApi([seeded()]);
      await openCobros(page, api);
      await page.getByRole("button", { name: "Nuevo cobro" }).click();
      const sheet = page.locator("[data-cobro-sheet]");
      // Escape first closes the open suggestions, then an untouched sheet closes right away.
      await expect(sheet.getByRole("option", { name: /Ana Quispe/ })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet.getByRole("listbox")).toBeHidden();
      await expect(sheet).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await page.getByRole("button", { name: "Nuevo cobro" }).click();
      await sheet.getByLabel("Nombre del cliente").fill("Carla Rojas");
      await expect(sheet.getByRole("listbox")).toBeHidden(); // no customer matches
      await page.keyboard.press("Escape");
      const ask = page.getByRole("alertdialog", { name: "¿Descartar este cobro?" });
      await expect(ask).toBeVisible();
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-discard-${width}.png` });
      await ask.getByRole("button", { name: "Seguir editando" }).click();
      await expect(ask).toBeHidden();
      await expect(sheet.getByLabel("Nombre del cliente")).toHaveValue("Carla Rojas");
      // Focus stays inside the dialog.
      for (let step = 0; step < 40; step += 1) {
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-cobro-sheet]")))).toBe(true);
      }
      await sheet.getByRole("button", { name: "Cerrar" }).click();
      await ask.getByRole("button", { name: "Descartar" }).click();
      await expect(sheet).toBeHidden();
      expect(createPosts(api)).toHaveLength(0);
    });

    test("the detail: timeline, Recordar, the reminders switch and Marcar como pagado", async ({ page }) => {
      const api = fakeApi([seeded()]);
      await openCobros(page, api);
      await page.locator("[data-cobro-card]").first().click();
      const sheet = page.locator("[data-cobro-sheet]");
      await expect(sheet).toContainText("Tu cliente lo abrió");
      await expect(sheet.getByRole("link", { name: "Ver como cliente" })).toHaveAttribute("href", "http://localhost:5175/d/tok_cdoc_9?preview=prev");
      if (SHOTS) {
        await page.waitForTimeout(400); // let the sheet's entrance finish
        await page.screenshot({ path: `${SHOTS}/dashboard-detail-${width}.png` });
      }
      await sheet.getByRole("button", { name: "Recordar" }).click();
      await sheet.getByRole("button", { name: "Recordar por correo" }).click();
      await expect(page.locator("[data-cobros-toast]")).toContainText("Recordatorio enviado a ana@example.com");
      expect(api.requests.find((request) => request.path.endsWith("/remind")).body).toEqual({ channel: "email" });

      await sheet.getByRole("switch", { name: /Recordatorios automáticos/ }).uncheck();
      await expect(page.locator("[data-cobros-toast]")).toContainText("Recordatorios automáticos apagados");
      expect(api.requests.find((request) => request.path.endsWith("/reminders")).body).toEqual({ autoReminders: false });

      await sheet.getByRole("button", { name: "Marcar como pagado" }).click();
      await sheet.getByRole("radio", { name: "Transferencia" }).check();
      await sheet.getByLabel(/Nota o referencia/).fill("BNB 123");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-mark-paid-${width}.png` });
      await sheet.getByRole("button", { name: "Confirmar pago" }).click();
      await expect(page.locator("[data-cobros-toast]")).toContainText("COB-0009 quedó pagado (transferencia)");
      expect(api.requests.find((request) => request.path.endsWith("/mark-paid")).body).toEqual({ method: "transfer", reference: "BNB 123" });
      await expect(sheet.locator(".cobro-detail-hero .cobro-chip")).toHaveText("Pagado");
      await expect(sheet).toContainText("Marcado como pagado · transferencia · BNB 123");
      // Paid by hand: no SIN factura line (no platform payment), and it counts in Cobrado.
      await expect(sheet).not.toContainText("factura SIN");
      await expect(page.locator(".cobros-summary .is-good")).toContainText("Bs 500,00");
    });

    test("test mode, a test payment and a payment to refund are all spelled out", async ({ page }) => {
      const api = fakeApi([
        seeded({ id: "cdoc_2", number: 2, numberLabel: "COB-0002", status: "PAID", paidAt: new Date().toISOString(), payment: { testMode: true, manual: false, afterClose: false, mismatch: false },
          events: [{ id: "p", type: "paid", version: 1, at: new Date().toISOString(), data: { livemode: false } }] }),
        seeded({ id: "cdoc_1", number: 1, numberLabel: "COB-0001", status: "VOIDED", customer: { name: "Beto Mamani", email: null, phone: null, document: null }, payment: { testMode: false, manual: false, afterClose: true, mismatch: false },
          events: [{ id: "v", type: "voided", at: "2026-09-22T10:00:00Z" }, { id: "x", type: "payment_after_close", at: "2026-09-23T10:00:00Z", data: {} }] }),
      ], { merchantStatus: "PENDING" });
      await openCobros(page, api);
      await expect(page.locator("[data-cobros-banner]")).toContainText("Modo de prueba mientras verificamos tu cuenta");
      await expect(page.locator("[data-cobros-test-note]")).toContainText("Pagos de prueba (30 días): Bs 500,00");
      await expect(page.locator(".cobros-summary .is-good")).toContainText("Bs 0,00");
      await expect(page.locator("[data-cobro-card]").first()).toContainText("Pago de prueba");
      await expect(page.locator("[data-cobro-flag]")).toHaveText("Pago recibido tras anular — reembolsar");
      await expect(page.locator("[data-cobros-attention]")).toContainText("Tienes 1 pago para revisar");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-attention-${width}.png`, fullPage: true });

      await page.locator("[data-cobros-attention]").getByRole("button", { name: /COB-0001/ }).click();
      const sheet = page.locator("[data-cobro-sheet]");
      await expect(sheet.locator("[data-cobro-attention-note]")).toContainText("Llegó un pago después de anular este cobro.");
      await expect(sheet.getByRole("link", { name: "Ir a Pagos" })).toBeVisible();
      await sheet.getByRole("button", { name: "Cerrar" }).click();

      await page.locator("[data-cobro-card]").first().click();
      await expect(sheet.locator("[data-cobro-test-note]")).toContainText("Fue un pago de prueba");
      await expect(sheet).not.toContainText("factura SIN");
    });

    test("the list pages with Cargar más and each tab asks the server", async ({ page }) => {
      const rows = Array.from({ length: 35 }, (_, index) => seeded({ id: `cdoc_${100 - index}`, number: 100 - index, numberLabel: `COB-${String(100 - index).padStart(4, "0")}` }));
      const api = fakeApi(rows);
      await openCobros(page, api);
      await expect(page.locator("[data-cobro-card]")).toHaveCount(30);
      await expect(page.getByRole("tab", { name: /Todos/ })).toContainText("35");
      await page.getByRole("button", { name: "Cargar más" }).click();
      await expect(page.locator("[data-cobro-card]")).toHaveCount(35);
      await expect(page.getByRole("button", { name: "Cargar más" })).toHaveCount(0);
      await page.getByRole("tab", { name: /Pagados/ }).click();
      await expect(page.locator(".cobros-filter-empty")).toBeVisible();
      expect(api.requests.some((request) => request.query.includes("state=paid"))).toBe(true);
    });
  });
}

test("customer and product names are shown as text, never as markup", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const hostile = '<img src=x onerror="window.__xss=1">';
  const api = fakeApi([{
    id: "cdoc_1", kind: "INVOICE", number: 1, numberLabel: "COB-0001", status: "SENT", title: hostile, currency: "BOB",
    customer: { name: hostile, email: null, phone: null, document: null },
    items: [{ id: "i1", description: hostile, quantity: 1, unitAmount: 100, amount: 100, paymentLinkId: null }],
    subtotalAmount: 100, discountAmount: 0, totalAmount: 100, content: [], dueAt: null, currentVersion: 1, sentAt: "2026-09-20T10:00:00Z",
    viewedAt: null, voidedAt: null, paidAt: null, autoReminders: true, publicUrl: "http://localhost:5175/d/tok_1", createdAt: "2026-09-20T10:00:00Z", events: [],
  }]);
  await openCobros(page, api);
  const card = page.locator("[data-cobro-card]").first();
  await expect(card).toContainText(hostile);
  await card.click();
  await expect(page.locator("[data-cobro-sheet]")).toContainText(hostile);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator("#cobrosRoot img, [data-cobro-sheet] img").count()).toBe(0);
  expect(errors).toEqual([]);
});
