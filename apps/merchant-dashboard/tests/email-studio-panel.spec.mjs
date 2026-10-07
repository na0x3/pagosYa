import { expect, test } from "@playwright/test";

const store = (id, name) => ({
  id,
  merchantId: "merchant_1",
  slug: id,
  name,
  websiteRevision: 0,
  websitePublishedRevision: 0,
  websiteDraft: null,
  status: "ACTIVE",
  backgroundColor: "#f8fafc",
  backgroundMode: "solid",
  backgroundGradientStart: "#f8fafc",
  backgroundGradientEnd: "#e0e7ff",
  backgroundGradientAngle: 135,
  heroSlides: [],
  contentOrder: ["hero", "about", "gallery", "products", "links"],
  experienceStyle: "editorial-grid",
  motionDuoEnabled: false,
  motionExperience: "clarity-marquee",
  motionExperiences: ["clarity-marquee"],
  animations: [],
  editorialGallery: [],
  links: [],
  customDomains: [],
  checkoutMode: "payment",
  contactPhone: null,
  contactEmail: null,
  contactFormEnabled: false,
  contactFormEmail: null,
  locationMapUrl: null,
  locationDescription: null,
  locationHighlight: null,
  locations: [],
  leadCaptureUrl: null,
  cartRecommendationsEnabled: true,
  cartRecommendationProductIds: [],
  showLowStockToCustomers: false,
});

/** The store's own receipt, as the generator would have authored it: tables and inline styles. */
const AUTHORED_EMAIL = `<!doctype html><html><body style="margin:0;background:#f6f3ee">
  <table width="100%" style="background:#f6f3ee"><tr><td align="center">
    <table width="600" style="background:#ffffff;font-family:Georgia,serif;color:#2b2b2b">
      <tr><td style="padding:24px"><h1 style="margin:0;font-size:22px">Café Illimani</h1></td></tr>
      <tr><td style="padding:0 24px"><p>Hola Ana, gracias por tu compra.</p></td></tr>
      <tr><td style="padding:0 24px"><p>Orden: pi_SYNTH001</p></td></tr>
      <tr><td style="padding:0 24px 24px"><p><strong>Total: Bs 150,00</strong></p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

const BASE = "/stores/store_1/source-project/emails";
const FIELDS = { storeName: "Café Illimani", fields: [
  { field: "subject", value: "Recibo de tu compra en {tienda}", edited: false, max: 90 },
  { field: "headline", value: "Gracias", edited: true, max: 80 },
] };
const status = (over = {}) => ({ kit: "active", candidate: false, previous: false, siteChanged: false, maxCredits: 25,
  types: [{ type: "order_confirmation", label: "Confirmación de compra", group: "Compras" }, { type: "appointment_confirmed", label: "Cita confirmada", group: "Compras" }], ...over });

/** Routes the Correos endpoints; `state.status` can be changed by a test to follow a design run. */
function correos(state) {
  return ({ path }) => {
    if (path === BASE) return state.status;
    if (path.startsWith(`${BASE}/preview`)) return { html: AUTHORED_EMAIL, subject: "x", repairs: [] };
    if (path.startsWith(`${BASE}/copy/`)) return state.copy ?? FIELDS;
    if (path.startsWith(BASE)) return { ok: true, status: "saved", credits: 7, repairs: [], sent: true, value: "x" };
    return undefined;
  };
}

async function openCorreos(page, state) {
  const requests = await openDashboard(page, [store("store_1", "Café Illimani")], correos(state));
  await navigateDashboard(page, "store-settings");
  await page.getByRole("tab", { name: "Correos" }).click();
  return requests;
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

/**
 * Mail clients cannot be driven in CI, so this is the practical substitute the design spec
 * names: the merchant's real browser, the real server.mjs, both widths rendered. It also
 * proves the lazy import of /src/email-studio-panel.mjs resolves — server.mjs keeps an
 * explicit /src/* allowlist, and a module missing from it 404s only in real use.
 */
test("Correos shows the buyer's email at phone and desktop width, through the real server.mjs", async ({ page }) => {
  await openCorreos(page, { status: status() });
  const frames = page.locator(".email-studio-frame iframe");
  await expect(frames).toHaveCount(2);
  await expect(frames.nth(0)).toHaveAttribute("width", "390");
  await expect(frames.nth(1)).toHaveAttribute("width", "640");
  for (const index of [0, 1]) {
    const body = frames.nth(index).contentFrame().locator("body");
    await expect(body).toContainText("Café Illimani");
    await expect(body).toContainText("Total: Bs 150,00");
  }
  // A closed sandbox is what makes rendering a store's authored HTML here safe.
  await expect(frames.nth(0)).toHaveAttribute("sandbox", "");
});

test("a store without a look designs one, then uses the new design", async ({ page }) => {
  const state = { status: status({ kit: "none" }) };
  const requests = await openCorreos(page, state);
  const design = page.getByRole("button", { name: "Diseñar mis correos · hasta 25 créditos" });
  await expect(design).toBeVisible();
  state.status = status({ candidate: true, previous: false });
  await design.click();
  await expect(page.getByRole("button", { name: "Usar este diseño" })).toBeVisible();
  expect(requests.find((r) => r.path === `${BASE}/design`)).toMatchObject({ method: "POST", body: { mode: "twin" } });
  // The preview shows the new design while it waits for the merchant.
  expect(requests.some((r) => r.path === `${BASE}/preview` && r.method === "GET")).toBe(true);
  state.status = status({ previous: true });
  await page.getByRole("button", { name: "Usar este diseño" }).click();
  await expect(page.getByRole("button", { name: "Volver al anterior" })).toBeVisible();
  expect(requests.some((r) => r.path === `${BASE}/candidate/accept` && r.method === "POST")).toBe(true);
});

test("wording is edited, saved and restored", async ({ page }) => {
  const requests = await openCorreos(page, { status: status() });
  await page.locator('[data-copy-field="subject"]').fill("Gracias por tu compra en {tienda}");
  await page.getByRole("button", { name: "Guardar texto" }).click();
  await expect.poll(() => requests.filter((r) => r.method === "PUT").map((r) => [r.path, r.body?.value])).toEqual([[`${BASE}/copy/order_confirmation/subject`, "Gracias por tu compra en {tienda}"]]);
  await page.getByRole("button", { name: "restaurar" }).click();
  await expect.poll(() => requests.some((r) => r.method === "DELETE" && r.path === `${BASE}/copy/order_confirmation/headline`)).toBe(true);
});

test("the test send goes to the signed-in merchant, naming the selected email and no address", async ({ page }) => {
  const requests = await openCorreos(page, { status: status() });
  await page.getByRole("button", { name: "Cita confirmada" }).click();
  await page.getByRole("button", { name: "Enviar una prueba" }).click();
  await expect(page.getByText("Te enviamos una prueba a tu correo.")).toBeVisible();
  const send = requests.find((r) => r.path === `${BASE}/test-send`);
  expect(send).toMatchObject({ method: "POST", body: { type: "appointment_confirmed" } });
  expect(Object.keys(send.body)).toEqual(["type"]);
});

test("a failed preview says so instead of showing an empty frame", async ({ page }) => {
  await openDashboard(page, [store("store_1", "Café Illimani")], correos({ status: status() }));
  // Registered after the catch-all, so Playwright matches this more recent route first.
  await page.route(`http://localhost:3001/v1${BASE}/preview**`, (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "No pudimos preparar la vista previa." }) }),
  );
  await navigateDashboard(page, "store-settings");
  await page.getByRole("tab", { name: "Correos" }).click();
  await expect(page.getByText("No pudimos preparar la vista previa")).toBeVisible();
  await expect(page.locator(".email-studio-frame iframe")).toHaveCount(0);
});

/**
 * An iframe narrowed by max-width re-lays the email out at the narrower width, so the frames keep
 * their real width and the strip scrolls; the page itself must never scroll sideways.
 */
test("at 390 px the frames keep their width and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCorreos(page, { status: status() });
  const frames = page.locator(".email-studio-frame iframe");
  await expect(frames).toHaveCount(2);
  expect(Math.round((await frames.nth(0).boundingBox()).width)).toBe(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
