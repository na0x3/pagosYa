import { expect, test } from "@playwright/test";

const store = (id, name) => ({
  id, merchantId: "merchant_1", slug: id, name, websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, status: "ACTIVE",
  backgroundColor: "#f8fafc", backgroundMode: "solid", backgroundGradientStart: "#f8fafc", backgroundGradientEnd: "#e0e7ff", backgroundGradientAngle: 135,
  heroSlides: [], contentOrder: ["hero", "about", "gallery", "products", "links"], experienceStyle: "editorial-grid", motionDuoEnabled: false,
  motionExperience: "clarity-marquee", motionExperiences: ["clarity-marquee"], animations: [], editorialGallery: [], links: [], customDomains: [],
  checkoutMode: "payment", contactPhone: null, contactEmail: null, contactFormEnabled: false, contactFormEmail: null, locationMapUrl: null,
  locationDescription: null, locationHighlight: null, locations: [], leadCaptureUrl: null, cartRecommendationsEnabled: true,
  cartRecommendationProductIds: [], showLowStockToCustomers: false,
});

const WORKSPACE = "/stores/store_1/email-workspace";
const BASE = "/stores/store_1/source-project/emails";
const template = (id, name, extra = {}) => ({ id, name, trigger: `Cuando ${name.toLowerCase()}`, supported: true, enabled: false, subject: `${name} · {{store}}`, body: `Hola, ${name}.`, delayHours: 0, ...extra });
const overview = () => ({ storeName: "Café Illimani", revision: 4, emailConfigured: true, domain: null, staff: { enabled: false, recipients: [] }, logs: { items: [], nextBefore: null }, templates: [
  template("REFUND", "Confirmación de reembolso"), template("SHIPPED", "Pedido enviado"), template("WELCOME", "Bienvenida a la comunidad"),
  template("CANCELED", "Pedido cancelado"), template("DELIVERED", "Pedido entregado"), template("GIFT_CARD", "Entrega de tarjeta de regalo"),
  template("SUBSCRIPTION_FAILED", "Pago de suscripción fallido"), template("SUBSCRIPTION_SKIPPED", "Entrega de suscripción omitida", { supported: false }),
  template("RECOVERY", "Carrito abandonado", { delayHours: 24 }), template("REVIEW_REQUEST", "Solicitud de reseña", { delayHours: 24 }),
] });
const STATUS = { kit: "active", candidate: false, previous: false, siteChanged: false, maxCredits: 25, types: [{ type: "order_confirmation", label: "Confirmación de compra", group: "Compras" }, { type: "appointment_confirmed", label: "Cita confirmada", group: "Compras" }] };
const CONTENT = { available: true, content: {}, defaults: { announcement: "Gracias por comprar en {tienda}.", storyTitle: "Sobre {tienda}", storyText: "Somos {tienda}.", note: "Gracias." }, promos: [], photos: [] };

/** The email workspace keeps what a PUT saved, so the list redraws the way the API would answer. */
function correos() {
  const workspace = overview();
  return ({ path, request }) => {
    if (path === WORKSPACE) return workspace;
    if (path.startsWith(`${WORKSPACE}/templates/`) && request.method() === "PUT") {
      const body = request.postDataJSON(), row = workspace.templates.find((item) => item.id === path.split("/").pop());
      Object.assign(row, { enabled: body.enabled, subject: body.subject, body: body.body }, body.recoveryHours ? { delayHours: body.recoveryHours } : {});
      workspace.revision += 1;
      return { saved: true };
    }
    if (path === BASE) return STATUS;
    if (path.startsWith(`${BASE}/preview`)) return { html: "<p>Recibo de Café Illimani</p>", subject: "x", repairs: [] };
    if (path.startsWith(`${BASE}/copy/`)) return { storeName: "Café Illimani", fields: [] };
    if (path === `${BASE}/content`) return CONTENT;
    return undefined;
  };
}

async function openDashboard(page, stores, responseForRequest) {
  const requests = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const contentType = request.headers()["content-type"] || "";
    requests.push({ path, method: request.method(), body: contentType.includes("application/json") ? request.postDataJSON() : undefined });
    const customBody = await responseForRequest?.({ path, request });
    let body = customBody ?? {};
    if (customBody === undefined) {
      if (path === "/stores") body = stores;
      else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
      else if (path === "/merchants/balance") body = { payableBalance: 0 };
      else if (path === "/merchants/kyc") body = { status: "APPROVED" };
      else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
      else if (path === "/merchants/payouts" || path === "/payment_intents" || path === "/merchants/orders" || path.includes("/categories") || path.includes("/payment_links") || path.includes("/operations/integrations") || path.includes("/promo-codes") || path.includes("/debt-collection-links") || path.endsWith("/domains")) body = [];
      else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
      else if (path.endsWith("/settings")) body = { ...request.postDataJSON(), websiteRevision: request.postDataJSON().revision + 1 };
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-stores");
  await expect(page.locator("#sidebarStorePicker")).toContainText(stores[0].name);
  return requests;
}

async function navigateDashboard(page, view) {
  const sidebar = page.locator(".dashboard-sidebar");
  const handle = page.locator("#storeFullscreenNavHandle");
  if (await handle.isVisible() && !(await sidebar.evaluate((element) => element.classList.contains("is-store-nav-pinned")))) await handle.click();
  const link = page.locator(`.dashboard-nav-button[data-dashboard-view="${view}"]`);
  await link.evaluate((element) => element.closest("details.dashboard-nav-group")?.setAttribute("open", ""));
  await link.click();
}

test("Correos y marketing opens on Correos and lists every store email once", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Café Illimani")], correos());
  await navigateDashboard(page, "marketing");
  await expect(page.locator("#marketingTabs button")).toHaveText(["Correos", "Equipo", "Remitente", "Registros", "Comeback Card", "Campañas", "Clientes", "Códigos promocionales"]);
  await expect(page.locator('[data-marketing-tab="emails"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#storeMarketingFrame")).toBeHidden();
  await expect(page.locator("[data-email-row] strong")).toHaveText(["Confirmación de compra", "Cita confirmada", "Enviado", "Entregado", "Cancelado", "Reembolso", "Tarjeta de regalo", "Pago de suscripción fallido", "Suscripción omitida", "Bienvenida", "Carrito abandonado", "Pedir reseña"]);
  // The purchase confirmation opens in the designed editor, with no second list of emails inside it.
  await expect(page.locator(".email-studio-frame iframe")).toHaveCount(2);
  await expect(page.locator(".email-studio-types")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Contenido de tus correos" })).toBeVisible();
  // A Studio tab still loads in the frame, and coming back shows the list again.
  await page.locator('[data-marketing-tab="staff"]').click();
  await expect(page.locator("#storeMarketingFrame")).toHaveAttribute("src", /library=marketing&tab=staff/);
  await expect(page.locator("#marketingEmails")).toBeHidden();
  await page.locator('[data-marketing-tab="emails"]').click();
  await expect(page.locator("#marketingEmails")).toBeVisible();
});

test("a switch saves its email, and Carrito abandonado saves its wait time", async ({ page }) => {
  const requests = await openDashboard(page, [store("store_1", "Café Illimani")], correos());
  await navigateDashboard(page, "marketing");
  await page.getByRole("checkbox", { name: "Enviar Pedir reseña" }).click();
  await expect.poll(() => requests.find((r) => r.method === "PUT" && r.path === `${WORKSPACE}/templates/REVIEW_REQUEST`)?.body).toEqual({ revision: 4, enabled: true, subject: "Solicitud de reseña · {{store}}", body: "Hola, Solicitud de reseña." });
  await expect(page.getByRole("checkbox", { name: "Enviar Pedir reseña" })).toBeChecked();
  await page.locator('[data-email-row="RECOVERY"]').click();
  const form = page.locator('[data-email-text-form="RECOVERY"]');
  await form.getByLabel("Horas de espera").fill("48");
  await form.getByRole("button", { name: "Guardar correo" }).click();
  await expect.poll(() => requests.find((r) => r.method === "PUT" && r.path === `${WORKSPACE}/templates/RECOVERY`)?.body).toEqual({ revision: 5, enabled: false, subject: "Carrito abandonado · {{store}}", body: "Hola, Carrito abandonado.", recoveryHours: 48 });
  await expect(page.locator('[data-email-row="RECOVERY"]')).toContainText("48 h");
});

test("selecting Cita confirmada opens the designed editor for that email", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Café Illimani")], correos());
  await navigateDashboard(page, "marketing");
  await page.locator('[data-email-row="appointment_confirmed"]').click();
  await expect(page.locator("[data-email-designed-root] .email-studio-head h3")).toHaveText("Cita confirmada");
  await expect(page.locator('[data-email-row="appointment_confirmed"]')).toHaveAttribute("aria-pressed", "true");
});

test("a Studio request for the old Plantillas tab lands on Correos", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Café Illimani")], correos());
  await navigateDashboard(page, "marketing");
  await page.locator('[data-marketing-tab="program"]').click();
  await page.evaluate(() => {
    const studio = /** @type {HTMLIFrameElement} */ (document.getElementById("merchantStudioFrame"));
    /** @type {any} */ (studio.contentWindow).eval(`parent.postMessage({ type: "pagosya:workspace", view: "marketing", tab: "templates" }, ${JSON.stringify(location.origin)})`);
  });
  await expect(page.locator('[data-marketing-tab="emails"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#marketingEmails")).toBeVisible();
});

test("at 390 px the list and the editor fit without the page scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page, [store("store_1", "Café Illimani")], correos());
  await navigateDashboard(page, "marketing");
  await expect(page.locator('[data-email-row="REVIEW_REQUEST"]')).toBeVisible();
  await page.locator('[data-email-row="RECOVERY"]').click();
  await expect(page.locator('[data-email-text-form="RECOVERY"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
