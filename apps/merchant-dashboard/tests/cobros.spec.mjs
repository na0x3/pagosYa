import { expect, test } from "@playwright/test";

// Documentos → Cobros: create a cobro, share it, and follow it. The API is mocked
// with a tiny in-memory store so create → send → list reads back what was posted.
const store = {
  id: "store_1", merchantId: "merchant_1", slug: "estudio", name: "Estudio Illimani", status: "ACTIVE",
  websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, heroSlides: [], contentOrder: [], editorialGallery: [],
  links: [], locations: [], animations: [], customDomains: [], checkoutMode: "payment", contactPhone: null, contactEmail: null,
};

const SHOTS = process.env.COBROS_SHOTS_DIR;

function fakeApi(initial = []) {
  const documents = [...initial];
  const requests = [];
  let number = documents.reduce((max, doc) => Math.max(max, doc.number || 0), 0);
  const detail = (doc) => ({
    ...doc,
    previewUrl: doc.publicUrl ? `${doc.publicUrl}?preview=prev` : null,
    versions: [],
    events: doc.events || [],
  });
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
    if (path === "/stores/store_1/documents" && method === "GET") return json(documents);
    if (path === "/stores/store_1/documents" && method === "POST") {
      const items = body.items.map((item, index) => ({ id: `item_${index}`, ...item, amount: item.quantity * item.unitAmount, paymentLinkId: item.paymentLinkId ?? null }));
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      const doc = {
        id: `cdoc_${documents.length + 1}`, kind: "INVOICE", number: null, numberLabel: "Borrador", status: "DRAFT", title: body.title, currency: "BOB",
        customer: { name: body.customerName, email: body.customerEmail || null, phone: body.customerPhone || null, document: null },
        items, subtotalAmount: total, discountAmount: 0, totalAmount: total, content: body.content, dueAt: body.dueAt ?? null,
        currentVersion: 0, sentAt: null, viewedAt: null, voidedAt: null, paidAt: null, autoReminders: body.autoReminders, publicUrl: null,
        createdAt: new Date().toISOString(), events: [{ id: "e1", type: "created", at: new Date().toISOString() }],
      };
      documents.unshift(doc);
      return json(doc);
    }
    const match = /^\/stores\/store_1\/documents\/([^/]+)(?:\/(send|remind|shared|void))?$/.exec(path);
    if (match) {
      const doc = documents.find((row) => row.id === match[1]);
      if (!doc) return json({ message: "Documento no encontrado" }, 404);
      if (!match[2] && method === "GET") return json(detail(doc));
      if (match[2] === "send") {
        if (!doc.number) { number += 1; doc.number = number; doc.numberLabel = `COB-${String(number).padStart(4, "0")}`; }
        doc.status = "SENT"; doc.currentVersion = 1; doc.sentAt = new Date().toISOString();
        doc.publicUrl = `http://localhost:5175/d/tok_${doc.id}`;
        doc.events.push({ id: `e${doc.events.length + 1}`, type: "sent", version: 1, at: new Date().toISOString(), data: {} });
        return json({ document: doc, publicUrl: doc.publicUrl, emailed: body?.email !== false && Boolean(doc.customer.email) });
      }
      if (match[2] === "remind") return json({ emailed: body.channel === "email" });
      if (match[2] === "shared") return json({ shared: true });
      if (match[2] === "void") { doc.status = "VOIDED"; return json(doc); }
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
      // 1. Customer from the suggestions.
      await sheet.getByLabel("Nombre del cliente").fill("an");
      await sheet.getByRole("option", { name: /Ana Quispe/ }).click();
      await expect(sheet.getByLabel("WhatsApp del cliente")).toHaveValue("70000000");
      await expect(sheet.getByLabel("Correo del cliente")).toHaveValue("ana@example.com");
      // 2. A catalog product and a free line.
      await sheet.getByRole("button", { name: "Desde tu catálogo" }).click();
      await sheet.getByRole("button", { name: /Diseño de logo/ }).click();
      await sheet.getByRole("button", { name: "Agregar otra línea" }).click();
      await sheet.getByLabel("Descripción de la línea 2").fill("Envío");
      await sheet.getByLabel("Precio de la línea 2").fill("25,50");
      // 3. Due preset.
      await sheet.getByRole("radio", { name: "15 días" }).check();
      await expect(sheet.locator("[data-cobro-total]")).toHaveText("Bs 1.525,50");
      if (SHOTS) await sheet.screenshot({ path: `${SHOTS}/dashboard-create-${width}.png` });
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-create-page-${width}.png` });
      await sheet.getByRole("button", { name: "Crear cobro" }).click();

      // Share sheet: real links, so no popup blocker gets in the way.
      await expect(sheet).toContainText("¡Cobro COB-0001 listo!");
      const whatsapp = sheet.getByRole("link", { name: /WhatsApp/ });
      await expect(whatsapp).toHaveAttribute("href", /^https:\/\/wa\.me\/59170000000\?text=Hola%20Ana%2C%20te%20comparto%20el%20cobro%20COB-0001/);
      await expect(whatsapp).toHaveAttribute("href", /localhost%3A5175%2Fd%2Ftok_cdoc_1/);
      await expect(sheet.getByRole("button", { name: /Enviar por correo/ })).toBeVisible();
      await expect(sheet.getByRole("button", { name: /Copiar enlace/ })).toBeVisible();
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-share-${width}.png` });

      const create = api.requests.find((request) => request.method === "POST" && request.path === "/stores/store_1/documents");
      expect(create.body).toEqual(expect.objectContaining({
        kind: "INVOICE",
        title: "Diseño de logo y 1 más",
        businessCustomerId: "cust_1",
        customerName: "Ana Quispe",
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
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/dashboard-list-${width}.png` });
      expect(errors).toEqual([]);
    });
  });
}

test("the detail shows the timeline, and Recordar emails the customer", async ({ page }) => {
  const api = fakeApi([{
    id: "cdoc_9", kind: "INVOICE", number: 9, numberLabel: "COB-0009", status: "VIEWED", title: "Diseño", currency: "BOB",
    customer: { name: "Ana Quispe", email: "ana@example.com", phone: "70000000", document: null },
    items: [{ id: "i1", description: "Diseño", quantity: 1, unitAmount: 50000, amount: 50000, paymentLinkId: null }],
    subtotalAmount: 50000, discountAmount: 0, totalAmount: 50000, content: [], dueAt: "2099-01-01T03:59:59.000Z",
    currentVersion: 1, sentAt: "2026-09-20T10:00:00Z", viewedAt: "2026-09-21T10:00:00Z", voidedAt: null, paidAt: null, autoReminders: true,
    publicUrl: "http://localhost:5175/d/tok_9", createdAt: "2026-09-20T10:00:00Z",
    events: [
      { id: "a", type: "created", at: "2026-09-20T10:00:00Z" },
      { id: "b", type: "sent", version: 1, at: "2026-09-20T10:00:01Z", data: {} },
      { id: "c", type: "viewed", version: 1, at: "2026-09-21T10:00:00Z" },
    ],
  }]);
  await openCobros(page, api);
  await page.locator("[data-cobro-card]").first().click();
  const sheet = page.locator("[data-cobro-sheet]");
  await expect(sheet).toContainText("Tu cliente lo abrió");
  await expect(sheet.getByRole("link", { name: "Ver como cliente" })).toHaveAttribute("href", "http://localhost:5175/d/tok_9?preview=prev");
  if (SHOTS) {
    await page.waitForTimeout(400); // let the sheet's entrance finish
    await page.screenshot({ path: `${SHOTS}/dashboard-detail-1280.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/dashboard-detail-390.png` });
  }
  await sheet.getByRole("button", { name: "Recordar" }).click();
  await sheet.getByRole("button", { name: "Recordar por correo" }).click();
  await expect(page.locator("[data-cobros-toast]")).toContainText("Recordatorio enviado a ana@example.com");
  expect(api.requests.find((request) => request.path.endsWith("/remind")).body).toEqual({ channel: "email" });
});

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
